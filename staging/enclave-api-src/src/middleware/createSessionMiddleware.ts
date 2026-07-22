import { HEADER_REQUEST_SIGNATURE, resolveSessionAuthMode } from '@hinkal/common';
import { NextFunction, Request, Response } from 'express';
import { EnclaveSessionValidationResult, openEnclaveSession } from '../models/EnclaveSessionSchema';
import { isValidSecp256k1PublicKey, verifyRequestSignature } from '../utils/requestSignatureUtils';
import { getSignedRequestFields } from '../utils/requestBinding';
import { parseCreateSessionRequest, verifyEnclaveSessionSignature } from './signatureMiddlewareUtils';

export const createSessionMiddleware = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const body = getSignedRequestFields(req);
    const parsed = parseCreateSessionRequest(body);
    if (parsed.ok === false) {
      res.status(400).json({ error: parsed.error });
      return;
    }

    const { clientPublicKey } = parsed.value;

    if (!isValidSecp256k1PublicKey(clientPublicKey)) {
      res.status(400).json({
        error: 'Missing or invalid clientPublicKey: must be a compressed secp256k1 public key (33 bytes hex)',
      });
      return;
    }

    const receivedSig = req.headers[HEADER_REQUEST_SIGNATURE];
    if (typeof receivedSig !== 'string' || !receivedSig) {
      res.status(401).json({ error: 'Missing x-hinkal-request-signature header' });
      return;
    }

    const rawBody = (req as Request & { rawBody?: string }).rawBody ?? '';
    if (!verifyRequestSignature(clientPublicKey, rawBody, receivedSig)) {
      res.status(401).json({ error: 'Invalid request signature' });
      return;
    }

    const request = parsed.value;
    const expiresAt = typeof body.expiresAt === 'string' && body.expiresAt ? new Date(body.expiresAt) : undefined;

    const authMode = resolveSessionAuthMode(request.useEIP712);
    const isValid = await verifyEnclaveSessionSignature(
      request.sessionId,
      request.clientPublicKey,
      request.signature,
      request.address,
      authMode,
    );

    if (!isValid) {
      res.status(401).json({ error: 'Invalid signature' });
      return;
    }

    const sessionResult = await openEnclaveSession({
      sessionId: request.sessionId,
      address: request.address,
      authMode,
      clientPublicKey,
      expiresAt,
    });

    if (sessionResult === EnclaveSessionValidationResult.EXPIRED) {
      res.status(401).json({ error: 'Session expired' });
      return;
    }

    if (sessionResult === EnclaveSessionValidationResult.CONFLICT) {
      res.status(409).json({ error: 'Session already registered for a different owner' });
      return;
    }

    if (sessionResult === EnclaveSessionValidationResult.ERROR) {
      res.status(500).json({ error: 'Error creating session' });
      return;
    }

    next();
  } catch {
    res.status(401).json({ error: 'Signature verification failed' });
  }
};
