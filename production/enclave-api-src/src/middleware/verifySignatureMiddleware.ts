import { NextFunction, Request, Response } from 'express';
import {
  getSessionAccess,
  parseSignatureRequest,
  validateExistingSessionOrRespond,
  verifyEnclaveSessionSignature,
  verifyWithKeyRequest,
} from './signatureMiddlewareUtils';

export const verifySignatureMiddleware = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const parsed = parseSignatureRequest({ ...req.query, ...req.body } as Record<string, unknown>);
    if (parsed.ok === false) {
      res.status(400).json({ error: parsed.error });
      return;
    }

    const request = parsed.value;
    const session = await validateExistingSessionOrRespond(request, res);
    if (!session) {
      return;
    }

    if (session.publicKey) {
      const ok = await verifyWithKeyRequest(req, res, session.publicKey);
      if (!ok) return;
      next();
      return;
    }

    const isValid = await verifyEnclaveSessionSignature(request, getSessionAccess(session));

    if (!isValid) {
      res.status(401).json({ error: 'Invalid signature' });
      return;
    }

    next();
  } catch {
    res.status(401).json({ error: 'Signature verification failed' });
  }
};
