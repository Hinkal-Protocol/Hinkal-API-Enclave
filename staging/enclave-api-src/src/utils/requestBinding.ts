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
