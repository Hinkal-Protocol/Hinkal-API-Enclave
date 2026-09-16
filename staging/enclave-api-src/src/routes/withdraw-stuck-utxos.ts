import { Request, Response, Router } from 'express';
import { getErrorMessage } from '@hinkal/common';
import { verifyWithdrawStuckUtxosSignatureMiddleware } from '../middleware';
import { WithdrawStuckUtxosRequest } from '../types';
import { hinkalInitializerService } from '../services/hinkalInitializerService';
import { getERC20Token } from '@hinkal/erc20-registry';
import { WHITELISTED_REFERRALS } from '@hinkal/backend-common';

const router = Router();

router.post(
  '/withdraw-stuck-utxos',
  verifyWithdrawStuckUtxosSignatureMiddleware,
  async (req: Request<object, unknown, WithdrawStuckUtxosRequest>, res: Response) => {
    try {
      const { chainId, tokenAddress, recipientAddress, ref } = req.body;

      if (ref !== undefined && !WHITELISTED_REFERRALS.includes(ref)) {
        res.status(400).json({ success: false, error: `Invalid ref: '${ref}' is not a whitelisted referral` });
        return;
      }

      const token = getERC20Token(tokenAddress, chainId);
      if (!token) {
        res.status(400).json({ success: false, error: `Token ${tokenAddress} not found on chain ${chainId}` });
        return;
      }

      const txHashes = await hinkalInitializerService.withHinkalForAddress(
        res.locals.address,
        chainId,
        async (hinkal) => {
          return hinkal.withdrawStuckUtxos(token, recipientAddress, ref);
        },
      );

      res.status(200).json({ success: true, txHashes });
    } catch (error) {
      res.status(500).json({ success: false, error: getErrorMessage(error) });
    }
  },
);

export default router;
