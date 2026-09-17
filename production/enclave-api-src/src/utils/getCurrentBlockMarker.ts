import { Connection } from '@solana/web3.js';
import { getRpcProvider } from '@hinkal/backend-common';
import { Hinkal, isSolanaLike, isTronLike, Logger, networkRegistry } from '@hinkal/common';

export const getCurrentBlockMarker = async (chainId: number, hinkal: Hinkal<unknown>): Promise<number> => {
  try {
    if (isSolanaLike(chainId)) return await new Connection(networkRegistry[chainId].rpcUrl, 'confirmed').getSlot();
    if (isTronLike(chainId)) {
      const block = await hinkal.getTronWeb().trx.getCurrentBlock();
      return Number(block.block_header.raw_data.number);
    }
    return await getRpcProvider(chainId).getBlockNumber();
  } catch (error) {
    Logger.error(`[getCurrentBlockMarker] failed for chain ${chainId}:`, error);
    throw error;
  }
};
