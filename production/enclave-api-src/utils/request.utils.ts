import { Request } from 'express';

export const parseQueryParams = <T extends Record<string, string>>(req: Request): T => req.query as T;
