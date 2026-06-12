import { NextFunction, Request, Response } from 'express';
import { Logger } from '@hinkal/common';
import { signResponseBody } from '../utils/responseSignature';

export const signResponseMiddleware = (req: Request, res: Response, next: NextFunction): void => {
  const originalJson = res.json.bind(res);
  res.json = (body: unknown) => {
    try {
      const nonce = (req.body as Record<string, unknown>)?.nonce ?? req.query?.nonce;
      const enrichedBody =
        nonce && typeof body === 'object' && body !== null ? { ...(body as Record<string, unknown>), nonce } : body;
      const responseBody = JSON.stringify(enrichedBody);
      res.setHeader('X-Hinkal-Signature', signResponseBody(responseBody));
      return originalJson(enrichedBody);
    } catch (err) {
      Logger.error('[signResponseMiddleware] failed to sign response:');
      return originalJson(body);
    }
  };
  next();
};
