import mongoose, { Schema } from 'mongoose';
import { EnclaveSessionAuthMode, MONGO_DUPLICATE_KEY_ERROR } from '../constants';

const ENCLAVE_SESSION_EXPIRATION_MS = 24 * 60 * 60 * 1000;

const EnclaveSessionSchema = new Schema({
  sessionId: { type: String, required: true, unique: true },
  expiresAt: { type: Date, required: true },
  authMode: {
    type: String,
    enum: Object.values(EnclaveSessionAuthMode),
    default: EnclaveSessionAuthMode.Normal,
  },
  address: { type: String, required: true },
  clientPublicKey: { type: String, required: true },
});

EnclaveSessionSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

const EnclaveSessionModel = mongoose.model('EnclaveSession', EnclaveSessionSchema);

export enum EnclaveSessionValidationResult {
  VALID = 'VALID',
  EXPIRED = 'EXPIRED',
  CONFLICT = 'CONFLICT',
  ERROR = 'ERROR',
}

export type EnclaveSession = {
  sessionId: string;
  expiresAt: Date;
  authMode: EnclaveSessionAuthMode;
  address: string;
  clientPublicKey: string;
};

type OpenEnclaveSessionParams = Pick<EnclaveSession, 'sessionId' | 'address' | 'authMode' | 'clientPublicKey'> & {
  expiresAt?: Date;
};

export const isEnclaveSessionActive = (session: EnclaveSession): boolean => session.expiresAt > new Date();

export const getEnclaveSession = async (sessionId: string): Promise<EnclaveSession | null> =>
  EnclaveSessionModel.findOne({ sessionId }).lean<EnclaveSession>();

const sessionValidationResult = (session: EnclaveSession): EnclaveSessionValidationResult =>
  isEnclaveSessionActive(session) ? EnclaveSessionValidationResult.VALID : EnclaveSessionValidationResult.EXPIRED;

export const openEnclaveSession = async (params: OpenEnclaveSessionParams): Promise<EnclaveSessionValidationResult> => {
  const now = new Date();
  const existing = await getEnclaveSession(params.sessionId);

  if (existing) {
    if (!isEnclaveSessionActive(existing)) {
      return EnclaveSessionValidationResult.EXPIRED;
    }

    const isSameSession = existing.address === params.address && existing.authMode === params.authMode;

    return isSameSession ? EnclaveSessionValidationResult.VALID : EnclaveSessionValidationResult.CONFLICT;
  }

  const expiresAt =
    params.expiresAt && params.expiresAt > now
      ? params.expiresAt
      : new Date(now.getTime() + ENCLAVE_SESSION_EXPIRATION_MS);

  try {
    await EnclaveSessionModel.create({
      sessionId: params.sessionId,
      expiresAt,
      authMode: params.authMode,
      address: params.address,
      clientPublicKey: params.clientPublicKey,
    });
    return EnclaveSessionValidationResult.VALID;
  } catch (err: unknown) {
    if ((err as { code?: number })?.code !== MONGO_DUPLICATE_KEY_ERROR) {
      return EnclaveSessionValidationResult.ERROR;
    }

    const raced = await getEnclaveSession(params.sessionId);
    if (!raced) {
      return EnclaveSessionValidationResult.ERROR;
    }

    const isSameSession = raced.address === params.address && raced.authMode === params.authMode;
    if (!isSameSession) {
      return EnclaveSessionValidationResult.CONFLICT;
    }

    return sessionValidationResult(raced);
  }
};
