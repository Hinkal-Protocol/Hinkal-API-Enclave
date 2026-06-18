import { secp256k1 } from '@noble/curves/secp256k1';
import { createHash } from 'crypto';
import { Request, Response } from 'express';
import { validate as validateUuid } from 'uuid';
import { EnclaveSessionAuthMode, HEADER_REQUEST_SIGNATURE } from '../constants';
import { EnclaveSession, getEnclaveSession, isEnclaveSessionActive } from '../models/EnclaveSessionSchema';

const sha256Bytes = (payload: string): Uint8Array => new Uint8Array(createHash('sha256').update(payload).digest());

export const isValidSecp256k1PublicKey = (hex: string): boolean => {
  try {
    secp256k1.Point.fromHex(hex);
    return true;
  } catch {
    return false;
  }
};

export const verifyRequestSignature = (clientPublicKeyHex: string, payload: string, signatureHex: string): boolean => {
  try {
    const msgHash = sha256Bytes(payload);
    const sig = Buffer.from(signatureHex, 'hex');
    const pubKey = Buffer.from(clientPublicKeyHex, 'hex');
    return secp256k1.verify(sig, msgHash, pubKey);
  } catch {
    return false;
  }
};

const SESSION_NOT_FOUND_ERROR = 'Session not found. Create a session first via POST /create-session';

export const verifyRequestSignatureSession = async (
  req: Request,
  res: Response,
  requireNormalAuthMode: boolean,
  payload: string,
): Promise<EnclaveSession | null> => {
  const body = { ...req.query, ...req.body } as Record<string, unknown>;
  const { sessionId, nonce } = body;

  if (typeof sessionId !== 'string' || !sessionId || !validateUuid(sessionId)) {
    res.status(400).json({ error: 'Missing or invalid sessionId' });
    return null;
  }

  if (typeof nonce !== 'string' || !nonce || !validateUuid(nonce)) {
    res.status(400).json({ error: 'Missing or invalid nonce' });
    return null;
  }

  const session = await getEnclaveSession(sessionId);

  if (!session) {
    res.status(401).json({ error: SESSION_NOT_FOUND_ERROR });
    return null;
  }

  if (!isEnclaveSessionActive(session)) {
    res.status(401).json({ error: 'Session expired' });
    return null;
  }

  if (requireNormalAuthMode && session.authMode !== EnclaveSessionAuthMode.Normal) {
    res.status(403).json({ error: 'Request signature transaction authorization requires normal auth mode' });
    return null;
  }

  const receivedSig = req.headers[HEADER_REQUEST_SIGNATURE];
  if (typeof receivedSig !== 'string' || !receivedSig) {
    res.status(401).json({ error: 'Missing x-hinkal-request-signature header' });
    return null;
  }

  if (!verifyRequestSignature(session.clientPublicKey, payload, receivedSig)) {
    res.status(401).json({ error: 'Invalid request signature' });
    return null;
  }

  return session;
};
