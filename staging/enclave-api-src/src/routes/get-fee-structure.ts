import { Request, Response, Router } from 'express';
import { getERC20Token, getErrorMessage } from '@hinkal/common';
import { getFeeStructure } from '@hinkal/common/functions/pre-transaction/getFeeStructure';
import { FeeStructureResponse, GetFeeStructureRequest } from '../types/route.types';
import { isValidExternalActionId } from '../utils/isValidExternalActionId';
import { verifySignatureMiddleware } from '../middleware';

const router = Router();

router.get(
  '/get-fee-structure',
  verifySignatureMiddleware,
  async (req: Request, res: Response<FeeStructureResponse>) => {
    try {
      const { feeToken, variableRate, externalActionId } = req.query as unknown as GetFeeStructureRequest;
      const chainId = Number(req.query.chainId);
      const tokenAddresses = ([] as string[]).concat(req.query.tokenAddresses as string | string[]);

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

      const feeStructure = await getFeeStructure(
        chainId,
        feeToken,
        tokenAddresses,
        externalActionId,
        [],
        variableRate ? BigInt(variableRate) : 0n,
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
