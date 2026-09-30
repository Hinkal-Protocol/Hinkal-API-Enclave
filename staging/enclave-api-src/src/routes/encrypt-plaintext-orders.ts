import { Request, Response, Router } from 'express';
import { getErrorMessage, Logger } from '@hinkal/common';
import { encryptPlaintextOrders } from '../migrations/encryptPlaintextOrders';

const router = Router();
// should be removed after we run this script once in the production
router.post('/encrypt-plaintext-orders', async (_req: Request, res: Response) => {
  try {
    const counts = await encryptPlaintextOrders();
    Logger.log('encryptPlaintextOrders done', counts);
    res.status(200).send({ status: 'success', data: counts });
  } catch (err) {
    Logger.error('encryptPlaintextOrders failed', getErrorMessage(err), err);
    res.status(500).send({ status: 'error', message: getErrorMessage(err) });
  }
});

export default router;
