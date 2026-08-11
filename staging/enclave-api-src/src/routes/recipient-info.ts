import { Request, Response, Router } from 'express';
import { getErrorMessage, RecipientInfoResponse } from '@hinkal/common';
import { hinkalInitializerService } from '../services/hinkalInitializerService';
import { verifyReadOnlySignatureMiddleware } from '../middleware';

const router = Router();

router.get(
  '/recipient-info',
  verifyReadOnlySignatureMiddleware,
  async (req: Request<object, RecipientInfoResponse>, res: Response<RecipientInfoResponse>) => {
    try {
      const chainIdNum = Number(req.query.chainId);
      const recipientInfo = await hinkalInitializerService.withHinkalForAddress(
        res.locals.address,
        chainIdNum,
        async (hinkal) => {
          return hinkal.getRecipientInfo();
        },
      );

      res.status(200).json({ success: true, recipientInfo });
    } catch (error) {
      res.status(500).json({ success: false, error: getErrorMessage(error) });
    }
  },
);

export default router;
