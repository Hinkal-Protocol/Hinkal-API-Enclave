import {
  AdminTransactionType,
  ENCLAVE_SWAP_VARIABLE_RATE,
  getErrorMessage,
  GetSwapDataResponse,
  isSolanaLike,
  Logger,
  TxHashResponse,
} from '@hinkal/common';
import { Request, Response, Router } from 'express';
import { hinkalInitializerService } from '../services/hinkalInitializerService';
import { getBestSwapQuote } from '../services/getBestSwapQuote';
import { GetSwapDataRequest, SwapRequest } from '../types/route.types';
import { parseFeeStructure } from '../utils/parseFeeStructure';
import { emitReferralVolume } from '../utils/emitReferralVolume';
import { verifyReadOnlySignatureMiddleware, verifySwapSignatureMiddleware } from '../middleware';
import { getERC20Token } from '@hinkal/erc20-registry';
import { WHITELISTED_REFERRALS } from '@hinkal/backend-common';

const router = Router();

router.post(
  '/swap',
  verifySwapSignatureMiddleware,
  async (req: Request<object, TxHashResponse, SwapRequest>, res: Response<TxHashResponse>) => {
    try {
      const { chainId, tokenAddresses, amounts, externalActionId, swapData, feeToken, feeAmount, ref } =
        req.body as SwapRequest;

      if (tokenAddresses.length !== amounts.length) {
        res.status(400).json({ success: false, error: 'Token addresses and amounts must have the same length' });
        return;
      }

      if (ref !== undefined && !WHITELISTED_REFERRALS.includes(ref)) {
        res.status(400).json({ success: false, error: `Invalid ref: '${ref}' is not a whitelisted referral` });
        return;
      }

      if (isSolanaLike(chainId) && tokenAddresses.length !== 2) {
        res
          .status(400)
          .json({ success: false, error: 'Solana swap requires exactly two token addresses (input and output)' });
        return;
      }

      const erc20Tokens = tokenAddresses
        .map((tokenAddress) => getERC20Token(tokenAddress, chainId))
        .filter((token) => token !== undefined);
      if (erc20Tokens.length !== tokenAddresses.length) {
        res.status(400).json({ success: false, error: `Token not found on chain ${chainId}` });
        return;
      }

      const resolvedFeeToken = isSolanaLike(chainId) ? tokenAddresses[1] : feeToken;

      const resolvedFeeStructure = parseFeeStructure(resolvedFeeToken, feeAmount, ENCLAVE_SWAP_VARIABLE_RATE);
      const txHash = await hinkalInitializerService.withHinkalForAddress(
        res.locals.address,
        chainId,
        async (hinkal) => {
          return hinkal.swap(
            erc20Tokens,
            amounts.map(BigInt),
            externalActionId,
            swapData,
            resolvedFeeToken,
            resolvedFeeStructure,
            undefined,
            AdminTransactionType.ApiSwap,
          );
        },
      );

      // Fee is taken from the output token
      emitReferralVolume(
        ref,
        chainId,
        txHash,
        [erc20Tokens[1]],
        [amounts[1]],
        resolvedFeeStructure?.variableRate ?? ENCLAVE_SWAP_VARIABLE_RATE,
      );

      res.status(200).json({ success: true, txHash });
    } catch (error) {
      Logger.error('[/swap] error:', error);
      res.status(500).json({ success: false, error: getErrorMessage(error) });
    }
  },
);

router.get(
  '/get-swap-data',
  verifyReadOnlySignatureMiddleware,
  async (req: Request, res: Response<GetSwapDataResponse>) => {
    try {
      const { inputTokenAddress, outputTokenAddress, amount, slippagePercentage } =
        req.query as unknown as GetSwapDataRequest;
      const chainId = Number(req.query.chainId);

      if (!chainId || !inputTokenAddress || !outputTokenAddress || !amount) {
        res.status(400).json({ success: false, error: 'Missing required swap parameters' });
        return;
      }

      if (amount.length === 0 || Number(amount) <= 0) {
        res.status(400).json({ success: false, error: 'Swap amount must be greater than zero' });
        return;
      }

      const inSwapToken = getERC20Token(inputTokenAddress, chainId);
      const outSwapToken = getERC20Token(outputTokenAddress, chainId);

      if (!inSwapToken || !outSwapToken) {
        res.status(400).json({ success: false, error: `Token not found on chain ${chainId}` });
        return;
      }

      const { swapData, externalActionId, outSwapAmount } = await getBestSwapQuote({
        chainId,
        inSwapToken,
        outSwapToken,
        inSwapAmount: amount,
        slippagePercentage,
      });

      res.status(200).json({
        success: true,
        swapData,
        externalActionId,
        outSwapAmount: outSwapAmount.toString(),
      });
    } catch (error) {
      res.status(500).json({ success: false, error: getErrorMessage(error) });
    }
  },
);

export default router;
