import { Request, Response } from 'express';
import { consumeRequestNonce } from '../models/RequestNonceSchema';
import { HINKAL_SUPPORTED_CHAINS } from '@hinkal/common';
import { buildEnclaveSignMessage, EnclaveSessionAuthMode } from '../constants';
import { ParsedCreateSessionRequest, ParsedSignatureRequest, ParseResult } from '../types';
import { verifySignature } from '../utils';
import { getSignedRequestFields } from '../utils/requestBinding';
import { validate as validateUuid } from 'uuid';

const REQUEST_NONCE_INVALID_ERROR = 'Invalid nonce: must be a UUID';
const SESSION_ID_INVALID_ERROR = 'Invalid sessionId: must be a UUID';

const parseUseEIP712 = (value: unknown): boolean => {
  if (typeof value === 'boolean') {
    return value;
  }
  if (typeof value === 'string') {
    return value === 'true' || value === '1';
  }
  return false;
};

const parseRequestNonce = (body: Record<string, unknown>): ParseResult<string> => {
  const { nonce } = body;

  if (typeof nonce !== 'string' || !nonce) {
    return { ok: false, error: 'Missing required field: nonce' };
  }

  if (!validateUuid(nonce)) {
    return { ok: false, error: REQUEST_NONCE_INVALID_ERROR };
  }

  return { ok: true, value: nonce };
};

const parseRequestTimestamp = (body: Record<string, unknown>): ParseResult<number | undefined> => {
  const { timestamp } = body;

  if (timestamp === undefined || timestamp === null || timestamp === '') {
    return { ok: true, value: undefined };
  }

  const parsed = typeof timestamp === 'number' ? timestamp : Number(timestamp);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return { ok: false, error: 'Invalid timestamp' };
  }

  return { ok: true, value: parsed };
};

export const parseCreateSessionRequest = (body: Record<string, unknown>): ParseResult<ParsedCreateSessionRequest> => {
  const timestampResult = parseRequestTimestamp(body);
  if (timestampResult.ok === false) return timestampResult;

  const { signature, address, sessionId, useEIP712, clientPublicKey } = body;

  if (
    typeof signature !== 'string' ||
    !signature ||
    typeof address !== 'string' ||
    !address ||
    typeof sessionId !== 'string' ||
    !sessionId ||
    typeof clientPublicKey !== 'string' ||
    !clientPublicKey
  ) {
    return { ok: false, error: 'Missing required fields' };
  }

  if (!validateUuid(sessionId)) {
    return { ok: false, error: SESSION_ID_INVALID_ERROR };
  }

  return {
    ok: true,
    value: {
      signature,
      address,
      sessionId,
      clientPublicKey,
      useEIP712: parseUseEIP712(useEIP712),
      ...(timestampResult.value !== undefined ? { timestamp: timestampResult.value } : {}),
    },
  };
};

export const parseSignatureRequest = (body: Record<string, unknown>): ParseResult<ParsedSignatureRequest> => {
  const nonceResult = parseRequestNonce(body);
  if (nonceResult.ok === false) return nonceResult;

  const timestampResult = parseRequestTimestamp(body);
  if (timestampResult.ok === false) return timestampResult;

  const { signature, sessionId } = body;

  if (typeof signature !== 'string' || !signature) {
    return { ok: false, error: 'Missing required field: signature' };
  }

  if (typeof sessionId !== 'string' || !sessionId) {
    return { ok: false, error: 'Missing required field: sessionId' };
  }

  if (!validateUuid(sessionId)) {
    return { ok: false, error: SESSION_ID_INVALID_ERROR };
  }

  const { chainId } = body;
  const parsedChainId = typeof chainId === 'number' ? chainId : Number(chainId);
  if (!Number.isFinite(parsedChainId)) {
    return { ok: false, error: 'Invalid chainId' };
  }

  return {
    ok: true,
    value: {
      signature,
      nonce: nonceResult.value,
      sessionId,
      chainId: parsedChainId,
      ...(timestampResult.value !== undefined ? { timestamp: timestampResult.value } : {}),
    },
  };
};

export const consumeRequestNonceOrRespond = async (req: Request, res: Response): Promise<boolean> => {
  const nonceResult = parseRequestNonce(getSignedRequestFields(req));
  if (nonceResult.ok === false) {
    res.status(400).json({ error: nonceResult.error });
    return false;
  }

  const consumed = await consumeRequestNonce(nonceResult.value);
  if (!consumed) {
    res.status(409).json({ error: 'nonce already used' });
    return false;
  }

  return true;
};

export const verifyEnclaveSessionSignature = async (
  sessionId: string,
  clientPublicKey: string,
  signature: string,
  address: string,
  authMode: EnclaveSessionAuthMode,
): Promise<boolean> => {
  const message = buildEnclaveSignMessage(sessionId, clientPublicKey, authMode);
  const results = await Promise.all(
    HINKAL_SUPPORTED_CHAINS.map((chainId) => verifySignature(signature, address, message, chainId).catch(() => false)),
  );
  return results.some(Boolean);
};
