import { NextFunction, Request, Response } from 'express';
import { EnclaveSessionAccess } from '../constants';
import { EnclaveNonceValidationResult, openEnclaveSession } from '../models/EnclaveNonceSchema';
import {
  consumeRequestIdOrRespond,
  parseSessionRequest,
  verifyEnclaveSessionSignature,
  verifyWithKeyRequest,
} from './signatureMiddlewareUtils';

export const createSessionMiddleware = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const body = { ...req.query, ...req.body } as Record<string, unknown>;
    const parsed = parseSessionRequest(body);
    if (parsed.ok === false) {
      res.status(400).json({ error: parsed.error });
      return;
    }

    const request = parsed.value;
    const publicKey =
      request.writeAccess && typeof body.publicKey === 'string' && body.publicKey ? body.publicKey : undefined;
    const expiresAt = typeof body.expiresAt === 'string' && body.expiresAt ? new Date(body.expiresAt) : undefined;

    const access = request.writeAccess ? EnclaveSessionAccess.Write : EnclaveSessionAccess.Read;
    const isValid = await verifyEnclaveSessionSignature(request, access);

    if (!isValid) {
      res.status(401).json({ error: 'Invalid signature' });
      return;
    }

    if (publicKey) {
      const ok = await verifyWithKeyRequest(req, res, publicKey);
      if (!ok) return;
    }

    if (!(await consumeRequestIdOrRespond(req, res))) return;

    const nonceResult = await openEnclaveSession({
      nonce: request.nonce,
      address: request.address,
      hasWriteAccess: request.writeAccess,
      publicKey,
      expiresAt,
    });

    if (nonceResult === EnclaveNonceValidationResult.EXPIRED) {
      res.status(401).json({ error: 'Nonce expired' });
      return;
    }

    if (nonceResult === EnclaveNonceValidationResult.CONFLICT) {
      res.status(409).json({ error: 'Nonce already registered for a different session' });
      return;
    }

    if (nonceResult === EnclaveNonceValidationResult.ERROR) {
      res.status(500).json({ error: 'Error creating session' });
      return;
    }

    next();
  } catch {
    res.status(401).json({ error: 'Signature verification failed' });
  }
};
