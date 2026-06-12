import { Request, Response, Router } from 'express';
import { getErrorMessage } from '@hinkal/common';
import { hinkalInitializerService } from '../services/hinkalInitializerService';
import { BalanceRequest, RecipientInfoResponse } from '../types/route.types';
import { verifySignatureMiddleware } from '../middleware';

const router = Router();

router.get(
  '/recipient-info',
  verifySignatureMiddleware,
  async (req: Request<object, RecipientInfoResponse, never, BalanceRequest>, res: Response<RecipientInfoResponse>) => {
    try {
      const { address, chainId } = req.query;
      const chainIdNum = Number(chainId);

      const hinkal = await hinkalInitializerService.initalizeHinkalForAddress(address, chainIdNum);

      const recipientInfo = hinkal.getRecipientInfo();

      res.status(200).json({ success: true, recipientInfo });
    } catch (error) {
      res.status(500).json({ success: false, error: getErrorMessage(error) });
    }
  },
);

export default router;
