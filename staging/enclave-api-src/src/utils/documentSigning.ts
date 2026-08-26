import { createHash, createHmac, timingSafeEqual } from 'crypto';
import mongoose from 'mongoose';
import { requireEnv } from '@hinkal/common/functions/utils/requireEnv';
import { cryptoHelper } from '../crypto';

const INTEGRITY_FIELD = 'enclaveHmac';
const INTEGRITY_ALGORITHM = 'HMAC_SHA256';

/** Fields stored by MongoDB/Mongoose but not part of the signed payload. */
const UNSIGNED_FIELDS = new Set(['_id', '__v', INTEGRITY_FIELD]);

let hmacKeyCache: Buffer | null = null;

const getHmacKey = async (): Promise<Buffer> => {
  if (hmacKeyCache) return hmacKeyCache;
  const encryptedSeed = Buffer.from(requireEnv('ENCLAVE_HMAC_ENCRYPTED_SEED'), 'base64');
  const seed = await cryptoHelper.decrypt(encryptedSeed);
  hmacKeyCache = createHash('sha256')
    .update(Buffer.concat([Buffer.from('enclave-db-hmac-v1:'), seed]))
    .digest();
  return hmacKeyCache;
};

const canonicalPayload = (doc: Record<string, unknown>): string => {
  const filtered = Object.entries(doc)
    .filter(([k, v]) => !UNSIGNED_FIELDS.has(k) && v !== null && v !== undefined)
    .reduce<Record<string, unknown>>((acc, [k, v]) => ({ ...acc, [k]: v }), {});

  const seen = new WeakSet();
  return JSON.stringify(filtered, (_key, value: unknown) => {
    if (value && typeof value === 'object' && !Array.isArray(value)) {
      if (seen.has(value)) return value;
      seen.add(value);
      return Object.keys(value as Record<string, unknown>)
        .sort()
        .reduce<Record<string, unknown>>((acc, k) => ({ ...acc, [k]: (value as Record<string, unknown>)[k] }), {});
    }
    return value;
  });
};

const computeSignature = async (doc: Record<string, unknown>): Promise<string> => {
  const key = await getHmacKey();
  return createHmac('sha256', key).update(canonicalPayload(doc)).digest('base64');
};

export const sealDocument = async (doc: Record<string, unknown>): Promise<Record<string, unknown>> => {
  const signature = await computeSignature(doc);
  return { ...doc, [INTEGRITY_FIELD]: { algorithm: INTEGRITY_ALGORITHM, signature } };
};

export const verifyDocument = async (doc: Record<string, unknown>, label: string): Promise<void> => {
  const integrity = doc[INTEGRITY_FIELD] as Record<string, unknown> | undefined;
  if (!integrity || typeof integrity !== 'object') {
    throw new Error(`${label} integrity metadata missing`);
  }
  const { algorithm, signature } = integrity;
  if (algorithm !== INTEGRITY_ALGORITHM || typeof signature !== 'string' || !signature) {
    throw new Error(`${label} integrity metadata invalid`);
  }
  const expected = await computeSignature(doc);
  if (!timingSafeEqual(Buffer.from(signature, 'base64'), Buffer.from(expected, 'base64'))) {
    throw new Error(`${label} integrity check failed`);
  }
};

export const stripInternalFields = (doc: Record<string, unknown>): Record<string, unknown> =>
  Object.fromEntries(Object.entries(doc).filter(([k]) => !UNSIGNED_FIELDS.has(k)));

export const encryptField = async (value: string): Promise<string> => {
  const encrypted = await cryptoHelper.encrypt(Buffer.from(value, 'utf8'));
  return encrypted.toString('base64');
};

export const decryptField = async (blob: string): Promise<string> => {
  const decrypted = await cryptoHelper.decrypt(Buffer.from(blob, 'base64'));
  return decrypted.toString('utf8');
};

export const toRecord = (doc: unknown): Record<string, unknown> | null | undefined => {
  if (doc == null) return doc as null | undefined;
  return doc as Record<string, unknown>;
};

export const verifyRawDoc = async (
  doc: Record<string, unknown> | null | undefined,
  label: string,
): Promise<Record<string, unknown> | null> => {
  if (!doc) return null;
  await verifyDocument(doc, label);
  return doc;
};

export const publicDoc = async (
  doc: Record<string, unknown> | null | undefined,
  label: string,
): Promise<Record<string, unknown> | null> => {
  const verified = await verifyRawDoc(doc, label);
  if (!verified) return null;
  return stripInternalFields(verified);
};

export const replaceSignedDoc = async (
  collection: mongoose.Collection,
  existingDoc: unknown,
  updates: Record<string, unknown>,
  additionalFilter: Record<string, unknown> = {},
): Promise<Record<string, unknown> | null> => {
  const doc = toRecord(existingDoc);
  if (!doc?._id) throw new Error('Document missing _id');
  const replacement = { ...stripInternalFields(doc), ...updates };
  const sealed = await sealDocument(replacement);
  const result = await collection.replaceOne({ _id: doc._id, ...additionalFilter }, { _id: doc._id, ...sealed });
  if (result.matchedCount === 0) return null;
  return sealed;
};
