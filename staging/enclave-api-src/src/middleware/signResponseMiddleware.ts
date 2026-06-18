import { NextFunction, Request, Response } from 'express';
import { Logger } from '@hinkal/common';
import { HEADER_ENCLAVE_SIGNATURE } from '../constants';
import { signResponseBody } from '../utils/responseSignature';

const getRequestNonce = (req: Request): string | undefined => {
  const body = req.body as Record<string, unknown> | undefined;
  const queryNonce = req.query?.nonce;
  const bodyNonce = body?.nonce;

  if (typeof bodyNonce === 'string' && bodyNonce) return bodyNonce;
  if (typeof queryNonce === 'string' && queryNonce) return queryNonce;
  return undefined;
};

export const signResponseMiddleware = (req: Request, res: Response, next: NextFunction): void => {
  const originalJson = res.json.bind(res);
  res.json = (body: unknown) => {
    try {
      const nonce = getRequestNonce(req);

      const enriched =
        nonce && typeof body === 'object' && body !== null ? { ...(body as Record<string, unknown>), nonce } : body;

      const responseBody = JSON.stringify(enriched);
      res.setHeader(HEADER_ENCLAVE_SIGNATURE, signResponseBody(responseBody));
      return originalJson(enriched);
    } catch (err) {
      Logger.error('[signResponseMiddleware] failed to sign response:');
      return originalJson(body);
    }
  };
  next();
};
