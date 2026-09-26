import { ethers } from 'ethers';
import {
  addressToHexFormat,
  caseInsensitiveEqual,
  GET_LOGS_BLOCK_CHUNK,
  getReceiveVaultFactoryAddress,
  isSolanaLike,
  Logger,
} from '@hinkal/common';
import { getRpcProvider } from '@hinkal/backend-common';
import { PendingReceiveVaultRecoveryModel } from '../models/PendingReceiveVaultRecoverySchema';
import { ReceiveVaultRecoveryWatermarkModel } from '../models/ReceiveVaultRecoveryWatermarkSchema';
import { confirmPendingReceiveVaultRecovery } from './ReceiveVaultRecoveryConfirmationService';
import { OWN_DEPLOYMENT_MATCH } from '../constants';

const RECOVERED_EVENT_TOPIC = ethers.id('ReceiveVaultRecovered(address,address,address,uint256)');
const RECOVERED_ABI_CODER = ethers.AbiCoder.defaultAbiCoder();
const POLL_INTERVAL_MS = 15 * 1000;

class ReceiveVaultRecoveryListenerService {
  private timer: NodeJS.Timeout | null = null;

  async init(): Promise<void> {
    if (this.timer) return;
    this.timer = setInterval(() => {
      this.pollAllChains().catch((err) => Logger.error('[ReceiveVaultRecoveryListenerService] poll failed:', err));
    }, POLL_INTERVAL_MS);
    await this.pollAllChains();
  }

  // solana is handled in EnclaveDepositListenerService
  private async pollAllChains(): Promise<void> {
    const chainIds = (await PendingReceiveVaultRecoveryModel.distinct('chainId')) as number[];

    await Promise.all(
      chainIds
        .filter((chainId) => !isSolanaLike(chainId))
        .map((chainId) =>
          this.pollEvmChain(chainId).catch((err) =>
            Logger.error(`[ReceiveVaultRecoveryListenerService] poll failed for chain ${chainId}:`, err),
          ),
        ),
    );
  }

  // Covers both EVM and Tron chains.
  private async pollEvmChain(chainId: number): Promise<void> {
    try {
      const factoryAddress = getReceiveVaultFactoryAddress(chainId);
      if (!factoryAddress) return;

      const pending = await PendingReceiveVaultRecoveryModel.find({ chainId, ...OWN_DEPLOYMENT_MATCH }).lean();
      if (pending.length === 0) return;

      const vaultTopics = pending.map((doc) =>
        ethers.zeroPadValue(ethers.getAddress(addressToHexFormat(doc.vaultAddress)), 32),
      );

      const provider = getRpcProvider(chainId);
      const latestBlock = await provider.getBlockNumber();

      // Nothing before the oldest pending record can match, so that block is the floor.
      const earliestPendingBlock = Math.min(...pending.map((doc) => doc.createdAtBlock));
      const fromBlock = Math.min(Math.max(await this.loadWatermark(chainId), earliestPendingBlock), latestBlock);
      const toBlock = Math.min(fromBlock + GET_LOGS_BLOCK_CHUNK, latestBlock);
      if (fromBlock > toBlock) return;

      const logs = await provider.getLogs({
        address: factoryAddress,
        fromBlock,
        toBlock,
        topics: [RECOVERED_EVENT_TOPIC, vaultTopics],
      });

      const matches = logs.flatMap((log) => {
        const vault = ethers.getAddress(ethers.dataSlice(log.topics[1], 12));
        const token = ethers.getAddress(ethers.dataSlice(log.topics[2], 12));
        const doc = pending.find(
          (d) =>
            caseInsensitiveEqual(addressToHexFormat(d.vaultAddress), vault) &&
            caseInsensitiveEqual(addressToHexFormat(d.tokenAddress), token),
        );
        if (!doc || log.blockNumber < doc.createdAtBlock) return [];

        const decoded = RECOVERED_ABI_CODER.decode(['address', 'uint256'], log.data);
        return [{ doc, amount: decoded[1] as bigint, txHash: log.transactionHash }];
      });

      await Promise.all(
        matches.map(({ doc, amount, txHash }) =>
          confirmPendingReceiveVaultRecovery(chainId, doc.vaultAddress, doc.tokenAddress, txHash, amount),
        ),
      );

      await this.advanceWatermark(chainId, toBlock);
    } catch (error) {
      Logger.error(`[ReceiveVaultRecoveryListenerService] poll failed for chain ${chainId}:`, error);
    }
  }

  private async loadWatermark(chainId: number): Promise<number> {
    const existing = await ReceiveVaultRecoveryWatermarkModel.findOne({ chainId }).lean();
    return existing?.latestBlockNumber ?? 0;
  }

  private async advanceWatermark(chainId: number, latestBlock: number): Promise<void> {
    await ReceiveVaultRecoveryWatermarkModel.findOneAndUpdate(
      { chainId },
      { $max: { latestBlockNumber: latestBlock } },
      { upsert: true },
    );
  }
}

export const receiveVaultRecoveryListenerService = new ReceiveVaultRecoveryListenerService();
