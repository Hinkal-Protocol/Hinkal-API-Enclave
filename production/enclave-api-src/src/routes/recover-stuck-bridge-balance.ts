import { Request, Response, Router } from 'express';
import { getErrorMessage, isValidAddressForChain } from '@hinkal/common';
import { verifyRecoverStuckBridgeBalanceSignatureMiddleware } from '../middleware';
import { RecoverStuckBridgeBalanceRequest } from '../types';
import { invalidAddressMessage } from '../utils/queryGuards';
import { hinkalInitializerService } from '../services/hinkalInitializerService';
import { recoverStuckBridgeBalances } from '../services/stuckBalances';

const router = Router();

router.post(
  '/recover-stuck-bridge-balance',
  verifyRecoverStuckBridgeBalanceSignatureMiddleware,
  async (req: Request<object, unknown, RecoverStuckBridgeBalanceRequest>, res: Response) => {
    try {
      const { tokenAddress, recipientAddress } = req.body;
      const chainId = Number(req.body.chainId);

      if (!isValidAddressForChain(chainId, recipientAddress)) {
        res.status(400).json({ success: false, error: invalidAddressMessage('recipientAddress', chainId) });
        return;
      }

      const { foundCount, recoveredCount, recoveredAmount, errors } =
        await hinkalInitializerService.withHinkalForAddress(res.locals.address, chainId, (hinkal) =>
          recoverStuckBridgeBalances(hinkal, chainId, tokenAddress, recipientAddress),
        );

      if (!foundCount) {
        res.status(400).json({ success: false, error: 'No stuck bridge balance found for this token' });
        return;
      }

      if (!recoveredCount) {
        res.status(500).json({ success: false, error: errors[0], errors });
        return;
      }

      res.status(200).json({
        success: true,
        recoveredCount,
        recoveredAmount: recoveredAmount.toString(),
        failedCount: errors.length,
        errors,
      });
    } catch (error) {
      res.status(500).json({ success: false, error: getErrorMessage(error) });
    }
  },
);

export default router;
