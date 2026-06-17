import { Request, Response, Router } from 'express';
import { getErrorMessage } from '@hinkal/common';
import { verifyWithdrawStuckUtxosSignatureMiddleware } from '../middleware';
import { WithdrawStuckUtxosRequest } from '../types';
import { hinkalInitializerService } from '../services/hinkalInitializerService';
import { getERC20Token } from '@hinkal/erc20-registry';

const router = Router();

router.post(
  '/withdraw-stuck-utxos',
  verifyWithdrawStuckUtxosSignatureMiddleware,
  async (req: Request<object, unknown, WithdrawStuckUtxosRequest>, res: Response) => {
    try {
      const { address, chainId, tokenAddress, recipientAddress } = req.body;

      const token = getERC20Token(tokenAddress, chainId);
      if (!token) {
        res.status(400).json({ success: false, error: `Token ${tokenAddress} not found on chain ${chainId}` });
        return;
      }

      const txHashes = await hinkalInitializerService.withHinkalForAddress(address, chainId, async (hinkal) => {
        return hinkal.withdrawStuckUtxos(token, recipientAddress);
      });

      res.status(200).json({ success: true, txHashes });
    } catch (error) {
      res.status(500).json({ success: false, error: getErrorMessage(error) });
    }
  },
);

export default router;
