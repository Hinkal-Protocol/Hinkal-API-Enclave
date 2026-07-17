import { Request } from 'express';

const normalizeRoutePath = (path: string): string => {
  const withSlash = path.startsWith('/') ? path : `/${path}`;
  return withSlash.length > 1 ? withSlash.replace(/\/+$/, '') : withSlash;
};

/**
 * The action a signature is authorized for: HTTP method + normalized route path,
 * e.g. "POST /withdraw". Binding this into the signed digest prevents a signature
 * or X-Stamp made for one route from being replayed to another.
 */
export const buildActionBinding = (method: string, routePath: string): string =>
  `${method.toUpperCase()} ${normalizeRoutePath(routePath)}`;

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

/** secp256k1 request-signature payload: binds the action to the raw body/query. */
export const buildRequestSignaturePayload = (binding: string, payload: string): string => `${binding}\n${payload}`;

export const getSignedRequestFields = (req: Request): Record<string, unknown> =>
  ((req.method === 'POST' ? req.body : req.query) as Record<string, unknown> | undefined) ?? {};
