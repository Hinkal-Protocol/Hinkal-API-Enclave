import { Request, Response, Router } from 'express';
import { getERC20Token, getErrorMessage, isSolanaLike } from '@hinkal/common';
import { getFeeStructure } from '@hinkal/common/functions/pre-transaction/getFeeStructure';
import { calculateSolanaNullifierCount } from '@hinkal/common/functions/pre-transaction/calculateSolanaNullifierCount';
import { HINKAL_PRIVATE_SEND_VARIABLE_RATE } from '@hinkal/common/constants/protocol.constants';
import { hinkalInitializerService } from '../services/hinkalInitializerService';
import { FeeStructureResponse, GetFeeStructureRequest } from '../types/route.types';
import { isValidExternalActionId } from '../utils/isValidExternalActionId';
import { signResponseMiddleware, verifySignatureMiddleware } from '../middleware';

const router = Router();

router.get(
  '/get-fee-structure',
  signResponseMiddleware,
  verifySignatureMiddleware,
  async (req: Request, res: Response<FeeStructureResponse>) => {
    try {
      const { feeToken, variableRate, externalActionId, mintFrom } = req.query as unknown as GetFeeStructureRequest;
      const chainId = Number(req.query.chainId);
      const address = req.query.address as string | undefined;
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
      if (isSolanaLike(chainId) && address && amounts) {
        const hinkal = await hinkalInitializerService.initalizeHinkalForAddress(address, chainId);
        const amountChanges = amounts.map((a) => -1n * BigInt(a));
        const nullifierCount = await calculateSolanaNullifierCount(hinkal, chainId, tokenAddresses, amountChanges);
        solanaTransactionParams = { mintTo: feeToken ?? tokenAddresses[0], mintFrom, nullifierCount };
      }

      let resolvedVariableRate = 0n;
      if (variableRate) resolvedVariableRate = BigInt(variableRate);
      else if (solanaTransactionParams) resolvedVariableRate = HINKAL_PRIVATE_SEND_VARIABLE_RATE;

      const feeStructure = await getFeeStructure(
        chainId,
        feeToken,
        tokenAddresses,
        externalActionId,
        [],
        resolvedVariableRate,
        solanaTransactionParams,
      );

      res.status(200).json({
        success: true,
        feeStructure: {
          feeToken: feeStructure.feeToken,
          flatFee: feeStructure.flatFee.toString(),
          variableRate: feeStructure.variableRate.toString(),
        },
      });
    } catch (error) {
      res.status(500).json({ success: false, error: getErrorMessage(error) });
    }
  },
);

export default router;
