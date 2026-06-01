import { Request, Response, Router } from 'express';
import { getERC20Token, getErrorMessage } from '@hinkal/common';
import { hinkalInitializerService } from '../services/hinkalInitializerService';
import { TransferRequest, TxHashResponse } from '../types/route.types';
import { parseFeeStructure } from '../utils/parseFeeStructure';
import { verifyTransferSignatureMiddleware } from '../middleware';

const router = Router();

router.post(
  '/transfer',
  verifyTransferSignatureMiddleware,
  async (req: Request<object, TxHashResponse, TransferRequest>, res: Response<TxHashResponse>) => {
    try {
      const { address, chainId, tokenAddresses, amounts, recipientAddress, feeToken, feeStructure } =
        req.body as TransferRequest;

      if (tokenAddresses.length !== amounts.length) {
        res.status(400).json({ success: false, error: 'Token addresses and amounts must have the same length' });
        return;
      }

      const erc20Tokens = tokenAddresses
        .map((tokenAddress) => getERC20Token(tokenAddress, chainId))
        .filter((token) => token !== undefined);
      if (erc20Tokens.length !== tokenAddresses.length) {
        res.status(400).json({ success: false, error: `Token not found on chain ${chainId}` });
        return;
      }

      const hinkal = await hinkalInitializerService.initalizeHinkalForAddress(address, chainId);

      const txHash = await hinkal.transfer(
        erc20Tokens,
        amounts.map((amount) => -1n * BigInt(amount)),
        recipientAddress,
        feeToken,
        parseFeeStructure(feeStructure),
      );

      res.status(200).json({ success: true, txHash });
    } catch (error) {
      res.status(500).json({ success: false, error: getErrorMessage(error) });
    }
  },
);

export default router;
