import { Request } from 'express';
import { buildActionBinding } from '@hinkal/common';

/**
 * Resolve the action binding for the current request from the matched route pattern.
 * `req.route` is populated before route-level middleware runs; returns null if the
 * middleware is not mounted per-route (callers must fail closed).
 */
export const getRequestActionBinding = (req: Request): string | null =>
  typeof req.route?.path === 'string' ? buildActionBinding(req.method, req.route.path) : null;

/** Ed25519 X-Stamp message: binds the action to the signed params. */
export const buildStampMessage = (binding: string, params: Record<string, unknown>): string =>
  JSON.stringify([binding, Object.entries(params)]);

export const getSignedRequestFields = (req: Request): Record<string, unknown> =>
  ((req.method === 'POST' ? req.body : req.query) as Record<string, unknown> | undefined) ?? {};

const REQUEST_TIMESTAMP_WINDOW_MS = 5 * 60 * 1000;

// Timestamp is not required, for this we have to check it only when passed.
export const isTimestampWithinFreshnessWindow = (timestamp: unknown): boolean => {
  if (timestamp === undefined || timestamp === null || timestamp === '') return true;
  const parsed = typeof timestamp === 'number' ? timestamp : Number(timestamp);
  if (!Number.isFinite(parsed)) return true;
  return Math.abs(Date.now() - parsed) <= REQUEST_TIMESTAMP_WINDOW_MS;
};
