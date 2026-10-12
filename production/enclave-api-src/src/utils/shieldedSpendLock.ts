import { Mutex } from 'async-mutex';
import { getCustomUtxoProvider, getOrCreateMapValue, wait } from '@hinkal/common';
import { requestUtxoServerSync } from './requestUtxoServerSync';
import { confirmBroadcastTransaction } from './transactionHelpers';
import { UTXO_SYNC_TIMEOUT_MS } from '../constants';

const spendLocks = new Map<string, Mutex>();

export const runShieldedSpend = async <T>(
  organizationId: string,
  userId: string,
  chainId: number,
  spend: () => Promise<T>,
  txHashesOf: (result: T) => string[],
): Promise<T> => {
  const key = `${organizationId}:${userId}:${chainId}`;
  const mutex = getOrCreateMapValue(spendLocks, key, () => new Mutex());
  try {
    return await mutex.runExclusive(async () => {
      const result = await spend();
      await Promise.all(txHashesOf(result).map((txHash) => confirmBroadcastTransaction(chainId, txHash)));
      if (getCustomUtxoProvider()) await Promise.race([requestUtxoServerSync(chainId), wait(UTXO_SYNC_TIMEOUT_MS)]);
      return result;
    });
  } finally {
    if (!mutex.isLocked()) spendLocks.delete(key);
  }
};
