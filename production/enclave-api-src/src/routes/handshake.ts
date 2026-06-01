import { Request, Response, Router } from 'express';
import { cryptoHelper } from '../crypto';

const router = Router();

router.get('/handshake', async (_req: Request, res: Response) => {
  const publicKey = await cryptoHelper.getPublicKey();
  res.status(200).send({ publicKey });
});

export default router;
