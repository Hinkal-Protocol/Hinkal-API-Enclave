import { Request, Response, Router } from 'express';
import { getErrorMessage } from '@hinkal/common';
import { createSessionMiddleware } from '../middleware/createSessionMiddleware';
import { getEnclaveSession } from '../models/EnclaveSessionSchema';
import { CreateSessionRequest, CreateSessionResponse } from '../types/route.types';

const router = Router();

router.post(
  '/create-session',
  createSessionMiddleware,
  async (req: Request<object, CreateSessionResponse, CreateSessionRequest>, res: Response<CreateSessionResponse>) => {
    try {
      const { sessionId } = req.body;
      const session = await getEnclaveSession(sessionId);

      if (!session) {
        res.status(500).json({ success: false, error: 'Session was not created' });
        return;
      }

      res.status(200).json({
        success: true,
        expiresAt: session.expiresAt.toISOString(),
      });
    } catch (error) {
      res.status(500).json({ success: false, error: getErrorMessage(error) });
    }
  },
);

export default router;
