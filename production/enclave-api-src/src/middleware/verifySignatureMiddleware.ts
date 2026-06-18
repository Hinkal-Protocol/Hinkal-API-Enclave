import { NextFunction, Request, Response } from 'express';
import { verifyRequestSignatureSession } from '../utils/requestSignatureUtils';

export const verifySignatureMiddleware = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const isPost = req.method === 'POST';
    const payload = isPost
      ? ((req as Request & { rawBody?: string }).rawBody ?? '')
      : (req.originalUrl.split('?')[1] ?? '');
    const session = await verifyRequestSignatureSession(req, res, false, payload);
    if (!session) return;
    res.locals.address = session.address;
    next();
  } catch {
    res.status(401).json({ error: 'Request signature verification failed' });
  }
};
