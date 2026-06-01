import { Response } from 'express';
import { buildEnclaveSignMessage, EnclaveSessionAccess } from '../constants';
import {
  EnclaveNonceSession,
  EnclaveNonceValidationResult,
  getEnclaveNonceSession,
  isEnclaveNonceSessionActive,
  registerTxEnclaveNonce,
} from '../models/EnclaveNonceSchema';
import { ParsedSignatureRequest, ParseResult } from '../types';
import { verifySignature } from '../utils';
import { validate as validateUuid } from 'uuid';

const ENCLAVE_NONCE_INVALID_ERROR = 'Invalid nonce: must be a UUID';
const SESSION_NOT_FOUND_ERROR = 'Session not found. Create a session first via POST /create-session';

const isValidEnclaveNonce = (nonce: string): boolean => validateUuid(nonce);

const parseWriteAccess = (value: unknown): boolean => {
  if (typeof value === 'boolean') {
    return value;
  }
  if (typeof value === 'string') {
    return value === 'true' || value === '1';
  }
  return false;
};

export const parseSignatureRequest = (body: Record<string, unknown>): ParseResult<ParsedSignatureRequest> => {
  const { signature, address, nonce, chainId, writeAccess } = body;

  if (
    typeof signature !== 'string' ||
    !signature ||
    typeof address !== 'string' ||
    !address ||
    typeof nonce !== 'string' ||
    !nonce
  ) {
    return { ok: false, error: 'Missing required fields' };
  }

  if (!isValidEnclaveNonce(nonce)) {
    return { ok: false, error: ENCLAVE_NONCE_INVALID_ERROR };
  }

  const parsedChainId = typeof chainId === 'number' ? chainId : Number(chainId);
  if (!Number.isFinite(parsedChainId)) {
    return { ok: false, error: 'Invalid chainId' };
  }

  return {
    ok: true,
    value: {
      signature,
      address,
      chainId: parsedChainId,
      nonce,
      writeAccess: parseWriteAccess(writeAccess),
    },
  };
};

const respondToTxNonceRegistrationResult = (nonceResult: EnclaveNonceValidationResult, res: Response): boolean => {
  if (nonceResult === EnclaveNonceValidationResult.EXPIRED) {
    res.status(401).json({ error: 'Nonce expired' });
    return false;
  }
  if (nonceResult === EnclaveNonceValidationResult.CONFLICT) {
    res.status(409).json({ error: 'Nonce already used' });
    return false;
  }
  if (nonceResult === EnclaveNonceValidationResult.ERROR) {
    res.status(500).json({ error: 'Error validating nonce' });
    return false;
  }

  return true;
};

export const registerTxNonceOrRespond = async (nonce: string, res: Response): Promise<boolean> => {
  const nonceResult = await registerTxEnclaveNonce(nonce);
  return respondToTxNonceRegistrationResult(nonceResult, res);
};

export const validateExistingSessionOrRespond = async (
  request: ParsedSignatureRequest,
  res: Response,
): Promise<EnclaveNonceSession | null> => {
  const { nonce, address, chainId } = request;
  const session = await getEnclaveNonceSession(nonce);

  if (!session) {
    res.status(401).json({ error: SESSION_NOT_FOUND_ERROR });
    return null;
  }

  if (!isEnclaveNonceSessionActive(session)) {
    res.status(401).json({ error: 'Nonce expired' });
    return null;
  }

  if (session.address !== address || session.chainId !== chainId) {
    res.status(401).json({ error: 'Session address or chainId mismatch' });
    return null;
  }

  return session;
};

export const verifyEnclaveSessionSignature = async (
  request: ParsedSignatureRequest,
  access: EnclaveSessionAccess,
): Promise<boolean> => {
  const { signature, address, chainId, nonce } = request;
  return verifySignature(signature, address, buildEnclaveSignMessage(nonce, access), chainId);
};

export const getSessionAccess = (session: EnclaveNonceSession): EnclaveSessionAccess =>
  session.hasWriteAccess ? EnclaveSessionAccess.Write : EnclaveSessionAccess.Read;

export const isActiveWriteSessionForRequest = (
  session: EnclaveNonceSession,
  request: ParsedSignatureRequest,
): boolean => {
  const { address, chainId } = request;

  return (
    isEnclaveNonceSessionActive(session) &&
    session.hasWriteAccess &&
    session.address === address &&
    session.chainId === chainId
  );
};
