import { extractMessage } from '@hinkal/common';
import { Request, Response, Router } from 'express';
import { userKeysService } from '../services/userKeysService';

const router = Router();

// TEMPORARY: one-shot address-key normalization trigger. Delete this file and its routeLoader lines once run.
router.post('/maintenance/normalize-user-key-addresses', async (_req: Request, res: Response) => {
  try {
    const summary = await userKeysService.normalizeStoredAddressKeys();
    res.status(200).send({ status: 'success', ...summary });
  } catch (err) {
    res.status(500).send({ status: 'error', message: extractMessage(err) ?? 'normalization failed' });
  }
});

export default router;
