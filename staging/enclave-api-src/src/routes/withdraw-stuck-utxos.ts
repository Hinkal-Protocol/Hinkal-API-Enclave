import { Request, Response, Router } from 'express';
import { getERC20Token, getErrorMessage } from '@hinkal/common';
import { signResponseMiddleware, verifyWithdrawStuckUtxosSignatureMiddleware } from '../middleware';
import { WithdrawStuckUtxosRequest } from '../types';
import { hinkalInitializerService } from '../services/hinkalInitializerService';

const router = Router();

router.post(
  '/withdraw-stuck-utxos',
  signResponseMiddleware,
  verifyWithdrawStuckUtxosSignatureMiddleware,
  async (req: Request<object, unknown, WithdrawStuckUtxosRequest>, res: Response) => {
    try {
      const { address, chainId, tokenAddress, recipientAddress } = req.body;

      const token = getERC20Token(tokenAddress, chainId);
      if (!token) {
        res.status(400).json({ success: false, error: `Token ${tokenAddress} not found on chain ${chainId}` });
        return;
      }

      const hinkal = await hinkalInitializerService.initalizeHinkalForAddress(address, chainId);

      const txHashes = await hinkal.withdrawStuckUtxos(token, recipientAddress);

      res.status(200).json({ success: true, txHashes });
    } catch (error) {
      res.status(500).json({ success: false, error: getErrorMessage(error) });
    }
  },
);

export default router;
