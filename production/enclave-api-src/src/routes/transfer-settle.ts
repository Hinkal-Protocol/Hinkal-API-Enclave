import { getErrorMessage, Logger } from '@hinkal/common';
import { Request, Response, Router } from 'express';
import { transferSettleSignatureMiddleware } from '../middleware';
import { handleTransferSettle } from '../services/transferPayout';

// Internal: called by data-server's keeper after it settles a bound vault, not part of the public API.
const router = Router();

router.post('/transfer-settle', transferSettleSignatureMiddleware, async (req: Request, res: Response) => {
  try {
    const { chainId, settleTxHash } = req.body ?? {};
    if (!Number.isInteger(chainId) || typeof settleTxHash !== 'string' || !settleTxHash) {
      res.status(400).json({ success: false, error: 'chainId and settleTxHash are required' });
      return;
    }
    await handleTransferSettle(chainId, settleTxHash);
    res.status(200).json({ success: true });
  } catch (error) {
    Logger.error('[/transfer-settle] error:', error);
    res.status(500).json({ success: false, error: getErrorMessage(error) });
  }
});

export default router;
