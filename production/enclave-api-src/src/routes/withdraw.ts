import { Request, Response, Router } from 'express';
import { getErrorMessage, isSolanaLike } from '@hinkal/common';
import { hinkalInitializerService } from '../services/hinkalInitializerService';
import { TxHashResponse, WithdrawRequest } from '../types/route.types';
import { parseFeeStructure } from '../utils/parseFeeStructure';
import { verifyWithdrawSignatureMiddleware } from '../middleware';
import { getERC20Token } from '@hinkal/erc20-registry';

const router = Router();

router.post(
  '/withdraw',
  verifyWithdrawSignatureMiddleware,
  async (req: Request<object, TxHashResponse, WithdrawRequest>, res: Response<TxHashResponse>) => {
    try {
      const { address, chainId, tokenAddresses, amounts, recipientAddress, feeToken, feeStructure } =
        req.body as WithdrawRequest;

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

      const resolvedFeeToken = isSolanaLike(chainId) ? tokenAddresses[0] : feeToken;
      const txData = await hinkalInitializerService.withHinkalForAddress(address, chainId, async (hinkal) => {
        return hinkal.withdraw(
          erc20Tokens,
          amounts.map((amount) => -1n * BigInt(amount)),
          recipientAddress,
          false,
          resolvedFeeToken,
          parseFeeStructure(feeStructure),
        );
      });

      const txHash = typeof txData === 'string' ? txData : txData.hash;

      res.status(200).json({ success: true, txHash });
    } catch (error) {
      res.status(500).json({ success: false, error: getErrorMessage(error) });
    }
  },
);

export default router;
