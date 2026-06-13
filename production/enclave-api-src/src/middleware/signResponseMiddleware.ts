import { NextFunction, Request, Response } from 'express';
import { Logger } from '@hinkal/common';
import { signResponseBody } from '../utils/responseSignature';

export const signResponseMiddleware = (req: Request, res: Response, next: NextFunction): void => {
  const originalJson = res.json.bind(res);
  res.json = (body: unknown) => {
    try {
      const reqBody = req.body as Record<string, unknown>;
      const nonce = reqBody?.requestId ?? reqBody?.nonce ?? req.query?.requestId ?? req.query?.nonce;

      const enriched =
        nonce && typeof body === 'object' && body !== null
          ? { ...(body as Record<string, unknown>), nonce, timestamp: Date.now() }
          : body;

      const responseBody = JSON.stringify(enriched);
      res.setHeader('X-Hinkal-Signature', signResponseBody(responseBody));
      return originalJson(enriched);
    } catch (err) {
      Logger.error('[signResponseMiddleware] failed to sign response:');
      return originalJson(body);
    }
  };
  next();
};
