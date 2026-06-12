import mongoose, { Schema } from 'mongoose';

const ENCLAVE_SESSION_EXPIRATION_MS = 24 * 60 * 60 * 1000;
const ENCLAVE_TX_NONCE_EXPIRATION_MS = 60 * 1000;

const EnclaveNonceSchema = new Schema({
  nonce: { type: String, required: true, unique: true },
  expiresAt: { type: Date, required: true },
  hasWriteAccess: { type: Boolean, default: false },
  address: { type: String },
  chainId: { type: Number },
});

EnclaveNonceSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

export const EnclaveNonceModel = mongoose.model('EnclaveNonce', EnclaveNonceSchema);

export enum EnclaveNonceValidationResult {
  VALID = 'VALID',
  EXPIRED = 'EXPIRED',
  NOT_FOUND = 'NOT_FOUND',
  CONFLICT = 'CONFLICT',
  ERROR = 'ERROR',
}

export type EnclaveNonceSession = {
  nonce: string;
  expiresAt: Date;
  hasWriteAccess: boolean;
  address?: string;
  chainId?: number;
};

type OpenEnclaveSessionParams = {
  nonce: string;
  address: string;
  chainId: number;
  hasWriteAccess: boolean;
};

const toSession = (doc: {
  nonce: string;
  expiresAt: Date;
  hasWriteAccess?: boolean;
  address?: string | null;
  chainId?: number | null;
}): EnclaveNonceSession => ({
  nonce: doc.nonce,
  expiresAt: doc.expiresAt,
  hasWriteAccess: doc.hasWriteAccess ?? false,
  address: doc.address ?? undefined,
  chainId: doc.chainId ?? undefined,
});

export const isEnclaveNonceSessionActive = (session: EnclaveNonceSession): boolean => session.expiresAt > new Date();

export const getEnclaveNonceSession = async (nonce: string): Promise<EnclaveNonceSession | null> => {
  const existing = await EnclaveNonceModel.findOne({ nonce });
  return existing ? toSession(existing) : null;
};

const sessionValidationResult = (session: EnclaveNonceSession): EnclaveNonceValidationResult =>
  isEnclaveNonceSessionActive(session) ? EnclaveNonceValidationResult.VALID : EnclaveNonceValidationResult.EXPIRED;

export const openEnclaveSession = async (params: OpenEnclaveSessionParams): Promise<EnclaveNonceValidationResult> => {
  const now = new Date();
  const existing = await getEnclaveNonceSession(params.nonce);

  if (existing) {
    if (!isEnclaveNonceSessionActive(existing)) {
      return EnclaveNonceValidationResult.EXPIRED;
    }

    const isSameSession =
      existing.address === params.address &&
      existing.chainId === params.chainId &&
      existing.hasWriteAccess === params.hasWriteAccess;

    return isSameSession ? EnclaveNonceValidationResult.VALID : EnclaveNonceValidationResult.CONFLICT;
  }

  const expiresAt = new Date(now.getTime() + ENCLAVE_SESSION_EXPIRATION_MS);

  try {
    await EnclaveNonceModel.create({
      nonce: params.nonce,
      expiresAt,
      hasWriteAccess: params.hasWriteAccess,
      address: params.address,
      chainId: params.chainId,
    });
    return EnclaveNonceValidationResult.VALID;
  } catch (err: unknown) {
    if ((err as { code?: number })?.code !== 11000) {
      return EnclaveNonceValidationResult.ERROR;
    }

    const raced = await getEnclaveNonceSession(params.nonce);
    if (!raced) {
      return EnclaveNonceValidationResult.ERROR;
    }

    return sessionValidationResult(raced);
  }
};

export const registerTxEnclaveNonce = async (nonce: string): Promise<EnclaveNonceValidationResult> => {
  const existing = await getEnclaveNonceSession(nonce);

  if (existing) {
    return isEnclaveNonceSessionActive(existing)
      ? EnclaveNonceValidationResult.CONFLICT
      : EnclaveNonceValidationResult.EXPIRED;
  }

  const now = new Date();
  const expiresAt = new Date(now.getTime() + ENCLAVE_TX_NONCE_EXPIRATION_MS);

  try {
    await EnclaveNonceModel.create({ nonce, expiresAt, hasWriteAccess: true });
    return EnclaveNonceValidationResult.VALID;
  } catch (err: unknown) {
    if ((err as { code?: number })?.code !== 11000) {
      return EnclaveNonceValidationResult.ERROR;
    }

    const raced = await getEnclaveNonceSession(nonce);
    if (!raced) {
      return EnclaveNonceValidationResult.ERROR;
    }

    return isEnclaveNonceSessionActive(raced)
      ? EnclaveNonceValidationResult.CONFLICT
      : EnclaveNonceValidationResult.EXPIRED;
  }
};
