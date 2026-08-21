import { getErrorMessage, HINKAL_PRIVATE_SEND_VARIABLE_RATE, isSolanaLike, TxHashResponse } from '@hinkal/common';
import { Request, Response, Router } from 'express';
import { hinkalInitializerService } from '../services/hinkalInitializerService';
import { TransferRequest } from '../types/route.types';
import { parseFeeStructure } from '../utils/parseFeeStructure';
import { resolveRecipientInfo } from '../utils/transactionHelpers';
import { verifyTransferSignatureMiddleware } from '../middleware';
import { getERC20Token } from '@hinkal/erc20-registry';

const router = Router();

router.post(
  '/transfer',
  verifyTransferSignatureMiddleware,
  async (req: Request<object, TxHashResponse, TransferRequest>, res: Response<TxHashResponse>) => {
    try {
      const { chainId, tokenAddresses, amounts, recipientAddress, feeToken, feeAmount } = req.body as TransferRequest;

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

      const resolvedRecipientInfo = await resolveRecipientInfo(recipientAddress);
      const resolvedFeeToken = isSolanaLike(chainId) ? tokenAddresses[0] : feeToken;

      const resolvedFeeStructure = parseFeeStructure(resolvedFeeToken, feeAmount, HINKAL_PRIVATE_SEND_VARIABLE_RATE);

      const txHash = await hinkalInitializerService.withHinkalForAddress(
        res.locals.address,
        chainId,
        async (hinkal) => {
          return hinkal.transfer(
            erc20Tokens,
            amounts.map((amount) => -1n * BigInt(amount)),
            resolvedRecipientInfo,
            resolvedFeeToken,
            resolvedFeeStructure,
          );
        },
      );

      res.status(200).json({ success: true, txHash });
    } catch (error) {
      res.status(500).json({ success: false, error: getErrorMessage(error) });
    }
  },
);

export default router;
