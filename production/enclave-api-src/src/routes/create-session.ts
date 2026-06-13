import { Request, Response, Router } from 'express';
import { getErrorMessage } from '@hinkal/common';
import { createSessionMiddleware } from '../middleware/createSessionMiddleware';
import { getEnclaveNonceSession } from '../models/EnclaveNonceSchema';
import { CreateSessionRequest, CreateSessionResponse } from '../types/route.types';

const router = Router();

router.post(
  '/create-session',
  createSessionMiddleware,
  async (req: Request<object, CreateSessionResponse, CreateSessionRequest>, res: Response<CreateSessionResponse>) => {
    try {
      const { nonce } = req.body;
      const session = await getEnclaveNonceSession(nonce);

      if (!session) {
        res.status(500).json({ success: false, error: 'Session was not created' });
        return;
      }

      res.status(200).json({
        success: true,
        expiresAt: session.expiresAt.toISOString(),
        hasWriteAccess: session.hasWriteAccess,
        ...(session.publicKey && { publicKey: session.publicKey }),
      });
    } catch (error) {
      res.status(500).json({ success: false, error: getErrorMessage(error) });
    }
  },
);

export default router;
