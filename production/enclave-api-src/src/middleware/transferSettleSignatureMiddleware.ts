import { NextFunction, Request, Response } from 'express';
import { INTERNAL_HMAC_AUTH_HEADERS, verifyInternalHmacAuthHeaders } from '@hinkal/backend-common';
import { TRANSFER_SETTLE_COMMUNICATION_KEY, TRANSFER_SETTLE_MAX_AGE_MS } from '../constants';

// The signature covers path, body and a timestamp, so a captured request can't be replayed later or on another route.
export const transferSettleSignatureMiddleware = (req: Request, res: Response, next: NextFunction) => {
  const routePath = (req.route as { path?: unknown } | undefined)?.path;
  const isValid =
    typeof routePath === 'string' &&
    verifyInternalHmacAuthHeaders(
      TRANSFER_SETTLE_COMMUNICATION_KEY,
      {
        signature: req.header(INTERNAL_HMAC_AUTH_HEADERS.signature),
        timestamp: req.header(INTERNAL_HMAC_AUTH_HEADERS.timestamp),
        nonce: req.header(INTERNAL_HMAC_AUTH_HEADERS.nonce),
      },
      routePath,
      req.body,
      TRANSFER_SETTLE_MAX_AGE_MS,
    );
  if (!isValid) {
    res.status(401).json({ success: false, error: 'Unauthorized' });
    return;
  }
  next();
};
