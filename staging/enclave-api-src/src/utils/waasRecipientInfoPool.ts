/* eslint-disable no-await-in-loop */
import { createHash, createHmac, timingSafeEqual } from 'crypto';
import { hashEthereumAddress, Logger, RECIPIENT_INFO_TARGET_POOL_SIZE } from '@hinkal/common';
import { HENCLAVE_HMAC_SEED } from '../constants';
import { EnclaveHmac } from '../models/EnclaveHmacSchema';
import { RecipientInfoEntry, RecipientInfoPool, RecipientInfoPoolModel } from '../models/RecipientInfoPoolSchema';

const HMAC_ALGORITHM = 'HMAC_SHA256';
const RECIPIENT_INFO_POOL_WRITE_ATTEMPTS = 3;

const henclaveSeedHex = HENCLAVE_HMAC_SEED.trim().replace(/^0x/, '');
if (!/^([0-9a-f]{2})+$/i.test(henclaveSeedHex)) throw new Error('HENCLAVE_HMAC_SEED must be hex');
const HENCLAVE_HMAC_KEY = createHash('sha256')
  .update(Buffer.concat([Buffer.from('enclave-db-hmac-v1:'), Buffer.from(henclaveSeedHex, 'hex')]))
  .digest();

const poolSignature = (hashedAddress: string, entries: RecipientInfoEntry[]): string => {
  const payload = {
    hashedEthereumAddress: hashedAddress,
    kind: 'recipient-info-pool',
    recipientInfos: entries.map(({ privateAddress, isAvailable }) => ({ isAvailable, privateAddress })),
  };
  return createHmac('sha256', HENCLAVE_HMAC_KEY).update(JSON.stringify(payload)).digest('base64');
};

const isSealedPool = (pool: RecipientInfoPool): boolean => {
  if (pool.enclaveHmac?.algorithm !== HMAC_ALGORITHM || !pool.enclaveHmac.signature) return false;
  const stored = Buffer.from(pool.enclaveHmac.signature);
  const expected = Buffer.from(poolSignature(pool.hashedEthereumAddress, pool.recipientInfos ?? []));
  return stored.length === expected.length && timingSafeEqual(stored, expected);
};

const loadPool = async (hashedAddress: string): Promise<RecipientInfoPool | null> => {
  const pool = await RecipientInfoPoolModel.findOne({ hashedEthereumAddress: hashedAddress }).lean();
  if (!pool) return null;
  if (!isSealedPool(pool)) {
    Logger.log('recipientinfo: discarding pool for', hashedAddress);
    return null;
  }
  return pool;
};

const writePool = async (hashedAddress: string, entries: RecipientInfoEntry[], previous?: EnclaveHmac) => {
  const enclaveHmac = { algorithm: HMAC_ALGORITHM, signature: poolSignature(hashedAddress, entries) };
  const filter = previous
    ? { hashedEthereumAddress: hashedAddress, 'enclaveHmac.signature': previous.signature }
    : { hashedEthereumAddress: hashedAddress };
  const result = await RecipientInfoPoolModel.replaceOne(
    filter,
    { hashedEthereumAddress: hashedAddress, recipientInfos: entries, enclaveHmac },
    { upsert: !previous },
  );
  return result.matchedCount > 0 || result.upsertedCount > 0;
};

const countAvailableRecipientInfos = async (hashedAddress: string): Promise<number> => {
  const pool = await loadPool(hashedAddress);
  return pool ? pool.recipientInfos.filter((entry) => entry.isAvailable).length : 0;
};

const storeRecipientInfosToPool = async (hashedAddress: string, infos: string[]): Promise<void> => {
  const newEntries = infos.map((privateAddress) => ({ privateAddress, isAvailable: true }));
  for (let attempt = 0; attempt < RECIPIENT_INFO_POOL_WRITE_ATTEMPTS; attempt += 1) {
    const pool = await loadPool(hashedAddress);
    if (!pool) {
      await writePool(hashedAddress, newEntries);
      return;
    }

    const kept = pool.recipientInfos.filter((entry) => entry.isAvailable);
    if (await writePool(hashedAddress, [...kept, ...newEntries], pool.enclaveHmac)) return;
  }
  throw new Error(`store recipient infos: pool changed under ${RECIPIENT_INFO_POOL_WRITE_ATTEMPTS} attempts`);
};

export const storeWaasRecipientInfos = async (
  walletAddress: string,
  generate: (count: number) => string[],
): Promise<void> => {
  const hashedAddress = hashEthereumAddress(walletAddress);
  const needed = RECIPIENT_INFO_TARGET_POOL_SIZE - (await countAvailableRecipientInfos(hashedAddress));
  if (needed <= 0) return;
  await storeRecipientInfosToPool(hashedAddress, generate(needed));
};
