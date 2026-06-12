import { NextFunction, Request, Response } from 'express';
import { Logger } from '@hinkal/common';
import { signResponseBody } from '../utils/responseSignature';

export const signResponseMiddleware = (_req: Request, res: Response, next: NextFunction): void => {
  const originalJson = res.json.bind(res);
  res.json = (body: unknown) => {
    try {
      const responseBody = JSON.stringify(body);
      res.setHeader('X-Hinkal-Signature', signResponseBody(responseBody));
    } catch (err) {
      Logger.error('[signResponseMiddleware] failed to sign response:');
    }
    return originalJson(body);
  };
  next();
};
