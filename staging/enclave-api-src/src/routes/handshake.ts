import { Request, Response, Router } from 'express';
import { cryptoHelper } from '../crypto';
import { signResponseMiddleware } from '../middleware';

const router = Router();

router.get('/handshake', signResponseMiddleware, async (_req: Request, res: Response) => {
  const publicKey = await cryptoHelper.getPublicKey();
  res.status(200).send({ publicKey });
});

export default router;
