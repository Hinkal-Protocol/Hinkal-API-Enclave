import { createHash } from 'crypto';
import { Request, Response } from 'express';
import { secp256k1 } from '@noble/curves/secp256k1';
import { consumeRequestId } from '../models/RequestIdSchema';
import { HINKAL_SUPPORTED_CHAINS } from '@hinkal/common';
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

export const parseSessionRequest = (body: Record<string, unknown>): ParseResult<ParsedSignatureRequest> => {
  const { signature, address, nonce, writeAccess } = body;

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

  return { ok: true, value: { signature, address, nonce, writeAccess: parseWriteAccess(writeAccess) } };
};

export const parseSignatureRequest = (body: Record<string, unknown>): ParseResult<ParsedSignatureRequest> => {
  const base = parseSessionRequest(body);
  if (base.ok === false) return base;

  const { chainId } = body;
  const parsedChainId = typeof chainId === 'number' ? chainId : Number(chainId);
  if (!Number.isFinite(parsedChainId)) {
    return { ok: false, error: 'Invalid chainId' };
  }

  return { ok: true, value: { ...base.value, chainId: parsedChainId } };
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
  const { nonce, address } = request;
  const session = await getEnclaveNonceSession(nonce);

  if (!session) {
    res.status(401).json({ error: SESSION_NOT_FOUND_ERROR });
    return null;
  }

  if (!isEnclaveNonceSessionActive(session)) {
    res.status(401).json({ error: 'Nonce expired' });
    return null;
  }

  if (session.address !== address) {
    res.status(401).json({ error: 'Session address mismatch' });
    return null;
  }

  return session;
};

export const verifyEnclaveSessionSignature = async (
  request: ParsedSignatureRequest,
  access: EnclaveSessionAccess,
): Promise<boolean> => {
  const { signature, address, nonce } = request;
  const message = buildEnclaveSignMessage(nonce, access);
  const results = await Promise.all(
    HINKAL_SUPPORTED_CHAINS.map((chainId) => verifySignature(signature, address, message, chainId).catch(() => false)),
  );
  return results.some(Boolean);
};

export const getSessionAccess = (session: EnclaveNonceSession): EnclaveSessionAccess =>
  session.hasWriteAccess ? EnclaveSessionAccess.Write : EnclaveSessionAccess.Read;

export const isActiveWriteSessionForRequest = (
  session: EnclaveNonceSession,
  request: ParsedSignatureRequest,
): boolean => {
  const { address } = request;

  return isEnclaveNonceSessionActive(session) && session.hasWriteAccess && session.address === address;
};

export const verifySecp256k1Signature = (payload: string, signatureHex: string, publicKeyHex: string): boolean => {
  try {
    const msgHash = createHash('sha256').update(payload).digest();
    const sigBytes = new Uint8Array(Buffer.from(signatureHex, 'hex'));
    const pubKeyBytes = new Uint8Array(Buffer.from(publicKeyHex, 'hex'));
    return secp256k1.verify(sigBytes, msgHash, pubKeyBytes);
  } catch {
    return false;
  }
};

const getRawBody = (req: Request): string => {
  if (req.method === 'GET') {
    return req.url.split('?')[1] ?? '';
  }
  return (req as Request & { rawBody?: string }).rawBody ?? JSON.stringify(req.body);
};

export const verifyWithKeyRequest = async (req: Request, res: Response, publicKey: string): Promise<boolean> => {
  const requestSignature = req.headers['x-request-signature'];
  if (typeof requestSignature !== 'string' || !requestSignature) {
    res.status(401).json({ error: 'Missing X-Request-Signature header' });
    return false;
  }

  if (!verifySecp256k1Signature(getRawBody(req), requestSignature, publicKey)) {
    res.status(401).json({ error: 'Invalid request signature' });
    return false;
  }

  return true;
};

export const consumeRequestIdOrRespond = async (req: Request, res: Response): Promise<boolean> => {
  const { requestId } = { ...req.query, ...req.body } as Record<string, unknown>;
  if (typeof requestId !== 'string' || !requestId) return true;
  const consumed = await consumeRequestId(requestId);
  if (!consumed) {
    res.status(409).json({ error: 'requestId already used' });
    return false;
  }

  return true;
};
