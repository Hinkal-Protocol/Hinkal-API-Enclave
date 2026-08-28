import {
  getErrorMessage,
  HINKAL_UNSHIELD_VARIABLE_RATE,
  isNativePlaceholderAddress,
  isSolanaLike,
  TxHashResponse,
} from '@hinkal/common';
import { createHash } from 'crypto';
import { Request, Response, Router } from 'express';
import { hinkalInitializerService } from '../services/hinkalInitializerService';
import { WithdrawRequest } from '../types/route.types';
import { parseFeeStructure } from '../utils/parseFeeStructure';
import { verifyWithdrawSignatureMiddleware } from '../middleware';
import { getERC20Token } from '@hinkal/erc20-registry';
import { WITHDRAW_REF_HASH_VARIABLE_RATE_BPS } from '../constants/withdrawRefVariableRates';

const router = Router();

router.post(
  '/withdraw',
  verifyWithdrawSignatureMiddleware,
  async (req: Request<object, TxHashResponse, WithdrawRequest>, res: Response<TxHashResponse>) => {
    try {
      const { chainId, tokenAddresses, amounts, recipientAddress, feeToken, feeAmount, ref } =
        req.body as WithdrawRequest;

      if (tokenAddresses.length !== amounts.length) {
        res.status(400).json({ success: false, error: 'Token addresses and amounts must have the same length' });
        return;
      }

      if (isNativePlaceholderAddress(recipientAddress, chainId)) {
        res
          .status(400)
          .json({ success: false, error: 'recipientAddress must not be the native token placeholder address' });
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
      const refHash = createHash('sha256')
        .update(ref ?? '')
        .digest('hex');
      const resolvedVariableRate = WITHDRAW_REF_HASH_VARIABLE_RATE_BPS[refHash] ?? HINKAL_UNSHIELD_VARIABLE_RATE;
      const feeStructureOverride = parseFeeStructure(resolvedFeeToken, feeAmount, resolvedVariableRate);

      const txData = await hinkalInitializerService.withHinkalForAddress(
        res.locals.address,
        chainId,
        async (hinkal) => {
          return hinkal.withdraw(
            erc20Tokens,
            amounts.map((amount) => -1n * BigInt(amount)),
            recipientAddress,
            false,
            resolvedFeeToken,
            feeStructureOverride,
            resolvedVariableRate,
          );
        },
      );

      const txHash = typeof txData === 'string' ? txData : txData.hash;

      res.status(200).json({ success: true, txHash });
    } catch (error) {
      res.status(500).json({ success: false, error: getErrorMessage(error) });
    }
  },
);

export default router;
