import { getErrorMessage, Logger } from '@hinkal/common';
import mongoose from 'mongoose';

const ENCLAVE_SESSIONS_COLLECTION = 'enclavesessions';
const LEGACY_TTL_INDEX_KEY = JSON.stringify({ expiresAt: 1 });

// ONE-TIME PRODUCTION MIGRATION (M-5 fix): drops the legacy TTL index; no-ops once gone, safe every boot.
// Delete this file + its call site in index.ts once confirmed dropped.
export const dropLegacyEnclaveSessionTtlIndex = async (): Promise<void> => {
  try {
    const collection = mongoose.connection.collection(ENCLAVE_SESSIONS_COLLECTION);
    const indexes = await collection.indexes();
    const legacyIndex = indexes.find(
      (index) => index.expireAfterSeconds !== undefined && JSON.stringify(index.key) === LEGACY_TTL_INDEX_KEY,
    );

    if (!legacyIndex?.name) {
      Logger.log('dropLegacyEnclaveSessionTtlIndex: no legacy TTL index found, skipping');
      return;
    }

    await collection.dropIndex(legacyIndex.name);
    Logger.log('dropLegacyEnclaveSessionTtlIndex: dropped index', legacyIndex.name);
  } catch (err) {
    Logger.error('dropLegacyEnclaveSessionTtlIndex failed:', getErrorMessage(err), err);
  }
};
