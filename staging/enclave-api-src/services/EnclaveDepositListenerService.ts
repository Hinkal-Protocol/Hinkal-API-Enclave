import { ethers } from 'ethers';
import {
  AddressLookupTableAccount,
  Connection,
  Message,
  type MessageAccountKeys,
  MessageV0,
  PublicKey,
} from '@solana/web3.js';
import {
  BlockchainEvent,
  extractOrderIdFromMemos,
  getChainBalanceFetchingMutex,
  HINKAL_SUPPORTED_CHAINS,
  isSolanaLike,
  Logger,
  networkRegistry,
  PollingBlockchainEventEmitter,
  PollingSolanaBlockchainEventEmitter,
} from '@hinkal/common';
import { getContract, getRpcProvider, Web3Contracts } from '@hinkal/backend-common';
import { PAL_EVENTS_INITIAL_BLOCK_BY_CHAIN } from '../constants/palInitialBlocks';
import { PalOrderWatermarkModel } from '../models/PalOrderWatermarkSchema';
import { enclaveDepositDispatcherService } from './EnclaveWithdrawDispatcherService';

type EvmCallTrace = {
  to?: string;
  input?: string;
  calls?: EvmCallTrace[];
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
    const depositOnChainUtxosContract = getContract(chainId, Web3Contracts.DepositOnChainUtxos);
    const mutex = getChainBalanceFetchingMutex(chainId);

    const emitter = new PollingBlockchainEventEmitter(
      chainId,
      hinkalContract,
      fromBlock,
      false,
      mutex,
      maxPageSize,
      depositOnChainUtxosContract,
    );

    emitter.addEventProcessorFunction(async (events, scannedToBlock) =>
      this.processEvmEvents(chainId, events, hinkalContract, scannedToBlock),
    );
    await emitter.init();
  }

  private async initSolanaChain(chainId: number, fromSlot: number): Promise<void> {
    const { fetchRpcUrl, contractData, maxPageSize } = networkRegistry[chainId];
    const { hinkalAddress, hinkalIdl } = contractData;
    if (!fetchRpcUrl || !hinkalAddress || !hinkalIdl) return;

    const connection = new Connection(fetchRpcUrl, 'confirmed');
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
    const tx = await provider.getTransaction(txHash);
    if (!tx) return false;

    const orderId = await this.extractEvmOrderId(hinkalContract, tx, provider);
    if (!orderId) return false;

    const blockNumber = tx.blockNumber ?? 0;
    setImmediate(() => {
      enclaveDepositDispatcherService
        .handleDeposit({ chainId, txHash, fromAddress: tx.from, orderId })
        .then(async () => {
          const current = this.maxCompletedOrderBlockByChain.get(chainId) ?? 0;
          if (blockNumber > current) {
            this.maxCompletedOrderBlockByChain.set(chainId, blockNumber);
            await this.advanceWatermark(chainId, blockNumber);
          }
        })
        .catch((err) => Logger.error(`[EnclaveDepositListenerService] handleDeposit threw orderId=${orderId}:`, err));
    });
    return true;
  }

  private async extractEvmOrderId(
    hinkalContract: ethers.Contract,
    tx: ethers.TransactionResponse,
    provider: ethers.JsonRpcProvider,
  ): Promise<string | null> {
    const direct = this.decodeOrderId(hinkalContract, tx.data);
    if (direct) return direct;

    try {
      const trace = (await provider.send('debug_traceTransaction', [
        tx.hash,
        { tracer: 'callTracer' },
      ])) as EvmCallTrace;

      const hinkalAddress = (await hinkalContract.getAddress()).toLowerCase();
      return this.flattenTrace(trace)
        .filter((call) => call.to?.toLowerCase() === hinkalAddress && call.input)
        .reduce<string | null>(
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

  private decodeOrderId(hinkalContract: ethers.Contract, data: string): string | null {
    try {
      const decoded = hinkalContract.interface.parseTransaction({ data });
      const preHookMetadata: string | undefined = decoded?.args.circomData?.hookData?.preHookMetadata;
      if (!preHookMetadata || preHookMetadata === '0x' || preHookMetadata === '0x00') return null;
      const parsed = JSON.parse(ethers.toUtf8String(preHookMetadata)) as { orderId?: string };
      return parsed.orderId ?? null;
    } catch {
      return null;
    }
  }

  private async processSolanaEvents(
    chainId: number,
    events: BlockchainEvent[],
    scannedToBlock?: number,
  ): Promise<number> {
    const connection = this.solanaConnection;
    if (!connection) throw new Error(`[EnclaveDepositListenerService] Solana connection not initialized`);

    const commitmentEvents = events.filter((e) => e.eventName === 'NewCommitment');

    if (commitmentEvents.length === 0) {
      if (scannedToBlock !== undefined) {
        await this.advanceWatermark(chainId, scannedToBlock);
      }
      return 0;
    }

    const signatures = [...new Set(commitmentEvents.map((e) => e.transactionHash))];
    const results = await Promise.all(signatures.map((sig) => this.processSolanaTransaction(chainId, connection, sig)));

    const latestSlot = Math.max(...events.map((e) => e.blockNumber));
    await this.advanceWatermark(chainId, latestSlot);
    return results.filter(Boolean).length;
  }

  private async processSolanaTransaction(chainId: number, connection: Connection, signature: string): Promise<boolean> {
    const tx = await connection.getTransaction(signature, {
      commitment: 'confirmed',
      maxSupportedTransactionVersion: 0,
    });
    if (!tx || tx.meta?.err || !tx.transaction) return false;

    const { message } = tx.transaction;
    const accountKeys = await this.resolveAccountKeys(connection, message);

    const orderId = extractOrderIdFromMemos(message.compiledInstructions, accountKeys);
    if (!orderId) return false;

    const fromAddress = message.staticAccountKeys[0].toBase58();
    await enclaveDepositDispatcherService.handleDeposit({ chainId, txHash: signature, fromAddress, orderId });
    return true;
  }

  private async resolveAccountKeys(connection: Connection, message: Message | MessageV0): Promise<MessageAccountKeys> {
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
    const { fetchRpcUrl } = networkRegistry[chainId];
    if (!fetchRpcUrl) throw new Error(`Missing fetchRpcUrl for chain ${chainId}`);
    const connection = new Connection(fetchRpcUrl, 'confirmed');
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
