import { ethers } from 'ethers';
import { BorshCoder } from '@coral-xyz/anchor';
import {
  AddressLookupTableAccount,
  Connection,
  type MessageAccountKeys,
  type MessageCompiledInstruction,
  PublicKey,
  VersionedMessage,
} from '@solana/web3.js';
import {
  BlockchainEvent,
  caseInsensitiveEqual,
  extractOrderIdFromMemos,
  getChainBalanceFetchingMutex,
  HINKAL_SUPPORTED_CHAINS,
  isSolanaLike,
  Logger,
  networkRegistry,
  PollingBlockchainEventEmitter,
  PollingSolanaBlockchainEventEmitter,
  SOLANA_MAX_SUPPORTED_TX_VERSION,
  solanaNativeAddress,
} from '@hinkal/common';
import { getContract, getRpcProvider, Web3Contracts } from '@hinkal/backend-common';
import { PAL_EVENTS_INITIAL_BLOCK_BY_CHAIN } from '../constants/palInitialBlocks';
import { OWN_DEPLOYMENT_MATCH } from '../constants';
import { PalOrderWatermarkModel } from '../models/PalOrderWatermarkSchema';
import { PendingReceiveVaultRecoveryModel } from '../models/PendingReceiveVaultRecoverySchema';
import { enclaveDepositDispatcherService } from './EnclaveWithdrawDispatcherService';
import { confirmPendingDeposit } from './DepositReferralConfirmationService';
import { confirmPendingReceiveVaultRecovery } from './ReceiveVaultRecoveryConfirmationService';
import { DecodedDeposit, DecodedOrder } from '../types';

type EvmCallTrace = {
  to?: string;
  input?: string;
  calls?: EvmCallTrace[];
};

type RawTransaction = {
  hash: string;
  from: string;
  input: string;
  blockNumber: string | null;
};

class EnclaveDepositListenerService {
  private solanaConnection: Connection | null = null;

  private readonly maxCompletedOrderBlockByChain = new Map<number, number>();

  async init(): Promise<void> {
    await Promise.all(
      HINKAL_SUPPORTED_CHAINS.map((chainId) =>
        this.initChain(chainId).catch((err) => {
          Logger.error(`[EnclaveDepositListenerService] init failed for chain ${chainId}:`, err);
        }),
      ),
    );
  }

  private async initChain(chainId: number): Promise<void> {
    const fromBlock = await this.loadWatermark(chainId);
    if (isSolanaLike(chainId)) {
      await this.initSolanaChain(chainId, fromBlock);
    } else {
      await this.initEvmChain(chainId, fromBlock);
    }
  }

  private async initEvmChain(chainId: number, fromBlock: number): Promise<void> {
    const { maxPageSize } = networkRegistry[chainId];
    const hinkalContract = getContract(chainId, Web3Contracts.Hinkal);
    const mutex = getChainBalanceFetchingMutex(chainId);

    const emitter = new PollingBlockchainEventEmitter(chainId, hinkalContract, fromBlock, false, mutex, maxPageSize);

    emitter.addEventProcessorFunction(async (events, scannedToBlock) =>
      this.processEvmEvents(chainId, events, hinkalContract, scannedToBlock),
    );
    await emitter.init();
  }

  private async processEvmEvents(
    chainId: number,
    events: BlockchainEvent[],
    hinkalContract: ethers.Contract,
    scannedToBlock?: number,
  ): Promise<number> {
    const commitmentEvents = events.filter((e) => e.eventName === 'NewCommitment');

    if (commitmentEvents.length === 0) {
      if (scannedToBlock !== undefined) {
        await this.advanceWatermark(chainId, scannedToBlock);
      }
      return 0;
    }

    const txHashes = [...new Set(commitmentEvents.map((e) => e.transactionHash))];
    const provider = getRpcProvider(chainId);

    const results = await Promise.all(
      txHashes.map((txHash) => this.processEvmTransaction(chainId, provider, hinkalContract, txHash)),
    );

    return results.filter(Boolean).length;
  }

  private async processEvmTransaction(
    chainId: number,
    provider: ethers.JsonRpcProvider,
    hinkalContract: ethers.Contract,
    txHash: string,
  ): Promise<boolean> {
    const tx = (await provider.send('eth_getTransactionByHash', [txHash])) as RawTransaction | null;
    if (!tx) return false;

    const decoded = await this.extractEvmOrderId(hinkalContract, tx, provider);
    if (!decoded) return false;
    const { orderId, deposit } = decoded;

    const blockNumber = tx.blockNumber ? parseInt(tx.blockNumber, 16) : 0;
    setImmediate(() => {
      enclaveDepositDispatcherService
        .handleDeposit({ chainId, txHash, fromAddress: tx.from, orderId, deposit })
        .then(async () => {
          const current = this.maxCompletedOrderBlockByChain.get(chainId) ?? 0;
          if (blockNumber > current) {
            this.maxCompletedOrderBlockByChain.set(chainId, blockNumber);
            await this.advanceWatermark(chainId, blockNumber);
          }
        })
        .catch((err) => Logger.error(`[EnclaveDepositListenerService] handleDeposit threw orderId=${orderId}:`, err));

      confirmPendingDeposit(orderId, chainId, txHash).catch((err) =>
        Logger.error(`[EnclaveDepositListenerService] confirmPendingDeposit threw orderId=${orderId}:`, err),
      );
    });
    return true;
  }

  private async extractEvmOrderId(
    hinkalContract: ethers.Contract,
    tx: RawTransaction,
    provider: ethers.JsonRpcProvider,
  ): Promise<DecodedOrder | null> {
    const direct = this.decodeOrderId(hinkalContract, tx.input);
    if (direct) return direct;

    try {
      const trace = (await provider.send('debug_traceTransaction', [
        tx.hash,
        { tracer: 'callTracer' },
      ])) as EvmCallTrace;

      const hinkalAddress = (await hinkalContract.getAddress()).toLowerCase();
      return this.flattenTrace(trace)
        .filter((call) => call.to?.toLowerCase() === hinkalAddress && call.input)
        .reduce<DecodedOrder | null>(
          (found, call) => found ?? this.decodeOrderId(hinkalContract, call.input as string),
          null,
        );
    } catch {
      return null;
    }
  }

  private flattenTrace(trace: EvmCallTrace): EvmCallTrace[] {
    return [trace, ...(trace.calls ?? []).flatMap((c) => this.flattenTrace(c))];
  }

  private decodeOrderId(hinkalContract: ethers.Contract, data: string): DecodedOrder | null {
    try {
      const decoded = hinkalContract.interface.parseTransaction({ data });
      if (!decoded) return null;

      if (decoded.name === 'prooflessDeposit') {
        const orderId: string | undefined = decoded.args.orderId;
        if (!orderId) return null;
        const erc20Addresses: string[] = decoded.args.erc20Addresses ?? [];
        const amounts: bigint[] = decoded.args.amounts ?? [];
        return {
          orderId,
          deposit: { erc20Addresses, amounts: amounts.map((a) => a.toString()) },
        };
      }

      if (decoded.name === 'transact') {
        const extraData: string | undefined = decoded.args.circomData?.extraData;
        if (!extraData || extraData === '0x') return null;
        let orderId: string;
        try {
          orderId = ethers.toUtf8String(extraData);
        } catch {
          return null;
        }
        if (!orderId) return null;

        const erc20TokenAddresses: string[] = decoded.args.circomData?.erc20TokenAddresses ?? [];
        const amountChanges: bigint[] = decoded.args.circomData?.amountChanges ?? [];
        const deposits = erc20TokenAddresses
          .map((erc20Address, i) => ({ erc20Address, amount: amountChanges[i] ?? 0n }))
          .filter((d) => d.amount > 0n);

        return {
          orderId,
          deposit: {
            erc20Addresses: deposits.map((d) => d.erc20Address),
            amounts: deposits.map((d) => d.amount.toString()),
          },
        };
      }

      return null;
    } catch {
      return null;
    }
  }

  private decodeSolanaDeposit(
    chainId: number,
    instructions: readonly MessageCompiledInstruction[],
    accountKeys: MessageAccountKeys,
  ): DecodedDeposit | null {
    const { hinkalAddress, hinkalIdl } = networkRegistry[chainId].contractData;
    if (!hinkalAddress || !hinkalIdl) return null;

    const depositIx = instructions.find((ix) => accountKeys.get(ix.programIdIndex)?.toBase58() === hinkalAddress);
    if (!depositIx) return null;

    let decoded: { name: string; data: { amounts?: { toString(): string }[] } } | null;
    try {
      decoded = new BorshCoder(hinkalIdl).instruction.decode(Buffer.from(depositIx.data)) as typeof decoded;
    } catch {
      return null;
    }
    if (!decoded || !caseInsensitiveEqual(decoded.name, 'proofless_deposit')) return null;

    const idlAccounts = hinkalIdl.instructions.find((ix) =>
      caseInsensitiveEqual(ix.name, 'proofless_deposit'),
    )?.accounts;
    const mintSlot = idlAccounts?.findIndex((a) => a.name === 'mint') ?? -1;
    const mintKeyIndex = mintSlot >= 0 ? depositIx.accountKeyIndexes[mintSlot] : undefined;
    const mintPubkey = mintKeyIndex !== undefined ? accountKeys.get(mintKeyIndex) : null;
    // Anchor substitutes the program's own id for a missing optional account (`mint: null`
    // for a native SOL deposit); anything else is the actual SPL mint.
    const tokenAddress =
      !mintPubkey || mintPubkey.toBase58() === hinkalAddress ? solanaNativeAddress : mintPubkey.toBase58();

    const amounts = (decoded.data.amounts ?? []).map((a) => a.toString());
    return { erc20Addresses: amounts.map(() => tokenAddress), amounts };
  }

  private async initSolanaChain(chainId: number, fromSlot: number): Promise<void> {
    const { rpcUrl, contractData, maxPageSize } = networkRegistry[chainId];
    const { hinkalAddress, hinkalIdl } = contractData;
    if (!hinkalAddress || !hinkalIdl) return;

    const connection = new Connection(rpcUrl, 'confirmed');
    this.solanaConnection = connection;

    const mutex = getChainBalanceFetchingMutex(chainId);
    const emitter = new PollingSolanaBlockchainEventEmitter(
      chainId,
      connection,
      new PublicKey(hinkalAddress),
      fromSlot,
      false,
      mutex,
      maxPageSize,
    );
    emitter.setIdl(hinkalIdl);
    emitter.addEventProcessorFunction(async (events, scannedToBlock) =>
      this.processSolanaEvents(chainId, events, scannedToBlock),
    );
    await emitter.init();
  }

  private async processSolanaEvents(
    chainId: number,
    events: BlockchainEvent[],
    scannedToBlock?: number,
  ): Promise<number> {
    const connection = this.solanaConnection;
    if (!connection) throw new Error(`[EnclaveDepositListenerService] Solana connection not initialized`);

    await this.confirmSolanaReceiveVaultRecoveries(chainId, events);

    const commitmentEvents = events.filter((e) => e.eventName === 'NewCommitment');

    if (commitmentEvents.length === 0) {
      if (scannedToBlock !== undefined) {
        await this.advanceWatermark(chainId, scannedToBlock);
      }
      return 0;
    }

    const signatures = [...new Set(commitmentEvents.map((e) => e.transactionHash))];
    const results = await Promise.all(signatures.map((sig) => this.processSolanaTransaction(chainId, connection, sig)));
    return results.filter(Boolean).length;
  }

  // evm and tron is handled in ReceiveVaultRecoveryListenerService
  private async confirmSolanaReceiveVaultRecoveries(chainId: number, events: BlockchainEvent[]): Promise<void> {
    const recoveredEvents = events.filter((event) => event.eventName === 'ReceiveVaultRecovered');

    await Promise.all(
      recoveredEvents.map(async (event) => {
        try {
          const vault = event.getArg<string>('vault');
          const mint = event.getArg<string>('mint');
          const rawAmount = event.getArg<string>('amount');
          if (!vault || !mint || !rawAmount) return;

          const doc = await PendingReceiveVaultRecoveryModel.findOne({
            chainId,
            vaultAddress: vault,
            tokenAddress: mint,
            ...OWN_DEPLOYMENT_MATCH,
          }).lean();

          if (!doc || event.blockNumber < doc.createdAtBlock) return;

          await confirmPendingReceiveVaultRecovery(
            chainId,
            vault,
            mint,
            event.transactionHash,
            BigInt(`0x${rawAmount}`),
          );
        } catch (error) {
          Logger.error(`[EnclaveDepositListenerService] confirmPendingReceiveVaultRecovery failed:`, error);
        }
      }),
    );
  }

  private async processSolanaTransaction(chainId: number, connection: Connection, signature: string): Promise<boolean> {
    const tx = await connection.getTransaction(signature, {
      commitment: 'confirmed',
      maxSupportedTransactionVersion: SOLANA_MAX_SUPPORTED_TX_VERSION,
    });
    if (!tx || tx.meta?.err || !tx.transaction) return false;

    const { message } = tx.transaction;
    const accountKeys = await this.resolveAccountKeys(connection, message);

    const orderId = extractOrderIdFromMemos(message.compiledInstructions, accountKeys);
    if (!orderId) return false;

    const deposit = this.decodeSolanaDeposit(chainId, message.compiledInstructions, accountKeys);

    const fromAddress = message.staticAccountKeys[0].toBase58();
    const { slot } = tx;

    setImmediate(() => {
      enclaveDepositDispatcherService
        .handleDeposit({ chainId, txHash: signature, fromAddress, orderId, deposit })
        .then(async () => {
          const current = this.maxCompletedOrderBlockByChain.get(chainId) ?? 0;
          if (slot > current) {
            this.maxCompletedOrderBlockByChain.set(chainId, slot);
            await this.advanceWatermark(chainId, slot);
          }
        })
        .catch((err) => Logger.error(`[EnclaveDepositListenerService] handleDeposit threw orderId=${orderId}:`, err));

      confirmPendingDeposit(orderId, chainId, signature).catch((err) =>
        Logger.error(`[EnclaveDepositListenerService] confirmPendingDeposit threw orderId=${orderId}:`, err),
      );
    });
    return true;
  }

  private async resolveAccountKeys(connection: Connection, message: VersionedMessage): Promise<MessageAccountKeys> {
    if (message.version === 0) {
      const lutRows = await Promise.all(
        message.addressTableLookups.map((l) => connection.getAddressLookupTable(l.accountKey)),
      );
      const lookupTables = lutRows.map((r) => r.value).filter((t): t is AddressLookupTableAccount => t != null);
      return message.getAccountKeys({ addressLookupTableAccounts: lookupTables });
    }
    return message.getAccountKeys();
  }

  private async loadWatermark(chainId: number): Promise<number> {
    const existing = await PalOrderWatermarkModel.findOne({ chainId }).lean();
    if (existing) return existing.latestBlockNumber;

    const fallback =
      PAL_EVENTS_INITIAL_BLOCK_BY_CHAIN[chainId] ??
      (isSolanaLike(chainId) ? await this.fetchSolanaHead(chainId) : await getRpcProvider(chainId).getBlockNumber());

    await PalOrderWatermarkModel.create({ chainId, latestBlockNumber: fallback });
    return fallback;
  }

  private async fetchSolanaHead(chainId: number): Promise<number> {
    const { rpcUrl } = networkRegistry[chainId];
    const connection = new Connection(rpcUrl, 'confirmed');
    return connection.getSlot();
  }

  private async advanceWatermark(chainId: number, latestBlock: number): Promise<void> {
    await PalOrderWatermarkModel.findOneAndUpdate(
      { chainId },
      { $max: { latestBlockNumber: latestBlock } },
      { upsert: true, setDefaultsOnInsert: true },
    );
  }
}

export const enclaveDepositListenerService = new EnclaveDepositListenerService();
