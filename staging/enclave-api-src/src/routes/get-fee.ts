import { FeeResponse, getErrorMessage, isSolanaLike } from '@hinkal/common';
import { Request, Response, Router } from 'express';
import { getFeeStructure } from '@hinkal/common/functions/pre-transaction/getFeeStructure';
import { calculateSolanaNullifierCount } from '@hinkal/common/functions/pre-transaction/calculateSolanaNullifierCount';
import { hinkalInitializerService } from '../services/hinkalInitializerService';
import { GetFeeRequest } from '../types/route.types';
import { isValidExternalActionId } from '../utils/isValidExternalActionId';
import { verifyReadOnlySignatureMiddleware } from '../middleware';
import { getERC20Token } from '@hinkal/erc20-registry';

const router = Router();

router.get('/get-fee', verifyReadOnlySignatureMiddleware, async (req: Request, res: Response<FeeResponse>) => {
  try {
    const { feeToken, externalActionId, mintFrom } = req.query as unknown as GetFeeRequest;
    const chainId = Number(req.query.chainId);
    const tokenAddresses = ([] as string[]).concat(req.query.tokenAddresses as string | string[]);
    const amounts = req.query.amounts ? ([] as string[]).concat(req.query.amounts as string | string[]) : undefined;

    if (!isValidExternalActionId(externalActionId)) {
      res.status(400).json({
        success: false,
        error: `Invalid external action id: ${externalActionId}`,
      });
      return;
    }

    const missingToken = tokenAddresses.some((tokenAddress) => !getERC20Token(tokenAddress, chainId));
    if (missingToken) {
      res.status(400).json({ success: false, error: `Token not found on chain ${chainId}` });
      return;
    }

    let solanaTransactionParams: { mintTo: string; mintFrom?: string; nullifierCount: number } | undefined;
    if (isSolanaLike(chainId) && res.locals.address && amounts) {
      const amountChanges = amounts.map((a) => -1n * BigInt(a));
      const nullifierCount = await hinkalInitializerService.withHinkalForAddress(
        res.locals.address,
        chainId,
        async (hinkal) => {
          return calculateSolanaNullifierCount(hinkal, chainId, tokenAddresses, amountChanges);
        },
      );
      solanaTransactionParams = { mintTo: feeToken ?? tokenAddresses[0], mintFrom, nullifierCount };
    }

    const feeStructure = await getFeeStructure(
      chainId,
      feeToken,
      tokenAddresses,
      externalActionId,
      [],
      0n,
      solanaTransactionParams,
    );

    res.status(200).json({
      success: true,
      feeAmount: feeStructure.flatFee.toString(),
    });
  } catch (error) {
    res.status(500).json({ success: false, error: getErrorMessage(error) });
  }
});

export default router;
