import { Request, Response, Router } from 'express';
import { getErrorMessage, isSolanaLike, Logger } from '@hinkal/common';
import { hinkalInitializerService } from '../services/hinkalInitializerService';
import { getBestSwapQuote } from '../services/getBestSwapQuote';
import { GetSwapDataRequest, GetSwapDataResponse, SwapRequest, TxHashResponse } from '../types/route.types';
import { parseFeeStructure } from '../utils/parseFeeStructure';
import { verifySignatureMiddleware, verifySwapSignatureMiddleware } from '../middleware';
import { getERC20Token } from '@hinkal/erc20-registry';

const router = Router();

router.post(
  '/swap',
  verifySwapSignatureMiddleware,
  async (req: Request<object, TxHashResponse, SwapRequest>, res: Response<TxHashResponse>) => {
    try {
      const { address, chainId, tokenAddresses, amounts, externalActionId, swapData, feeToken, feeStructure } =
        req.body as SwapRequest;

      if (tokenAddresses.length !== amounts.length) {
        res.status(400).json({ success: false, error: 'Token addresses and amounts must have the same length' });
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

      const resolvedFeeStructure = parseFeeStructure(feeStructure);
      const txHash = await hinkalInitializerService.withHinkalForAddress(address, chainId, async (hinkal) => {
        return hinkal.swap(
          erc20Tokens,
          amounts.map(BigInt),
          externalActionId,
          swapData,
          resolvedFeeToken,
          resolvedFeeStructure,
        );
      });

      res.status(200).json({ success: true, txHash });
    } catch (error) {
      Logger.error('[/swap] error:', error);
      res.status(500).json({ success: false, error: getErrorMessage(error) });
    }
  },
);

router.get('/get-swap-data', verifySignatureMiddleware, async (req: Request, res: Response<GetSwapDataResponse>) => {
  try {
    const { address, inputTokenAddress, outputTokenAddress, amount, slippagePercentage } =
      req.query as unknown as GetSwapDataRequest;
    const chainId = Number(req.query.chainId);

    if (!address || !chainId || !inputTokenAddress || !outputTokenAddress || !amount) {
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

    const { swapData, externalActionId, outSwapAmount } = isSolanaLike(chainId)
      ? await getBestSwapQuote({
          hinkal: null,
          chainId,
          inSwapToken,
          outSwapToken,
          inSwapAmount: amount,
          slippagePercentage,
        })
      : await hinkalInitializerService.withHinkalForAddress(address, chainId, async (hinkal) => {
          return getBestSwapQuote({
            hinkal,
            chainId,
            inSwapToken,
            outSwapToken,
            inSwapAmount: amount,
            slippagePercentage,
          });
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
});

export default router;
