import {
  ENCLAVE_SWAP_VARIABLE_RATE,
  ENCLAVE_TRANSACT_VARIABLE_RATE,
  ExternalActionId,
  FeeResponse,
  getErrorMessage,
  isSolanaLike,
} from '@hinkal/common';
import { Request, Response, Router } from 'express';
import { getFeeStructureWithBreakdown } from '@hinkal/common/functions/pre-transaction/getFeeStructure';
import { calculateSolanaNullifierCount } from '@hinkal/common/functions/pre-transaction/calculateSolanaNullifierCount';
import { hinkalInitializerService } from '../services/hinkalInitializerService';
import { GetFeeRequest } from '../types/route.types';
import { isValidExternalActionId } from '../utils/isValidExternalActionId';
import {
  getHinkalVariableRate,
  getRequestAttribution,
  partnerKeyMiddleware,
  verifyReadOnlySignatureMiddleware,
} from '../middleware';
import { getERC20Token } from '@hinkal/erc20-registry';
import { rejectNonWhitelistedRef, resolveRef } from '../utils/referralWhitelist';

const router = Router();

router.get(
  '/get-fee',
  verifyReadOnlySignatureMiddleware,
  partnerKeyMiddleware,
  async (req: Request, res: Response<FeeResponse>) => {
    try {
      const { feeToken, externalActionId, mintFrom, ref } = req.query as unknown as GetFeeRequest;
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

      const isTransact = externalActionId === ExternalActionId.Transact;
      if (!isTransact && rejectNonWhitelistedRef(res, ref)) return;
      const resolvedRef = isTransact ? resolveRef(res, ref) : {};
      if (!resolvedRef) return;

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

      const { feeStructure, breakdown } = await getFeeStructureWithBreakdown(
        chainId,
        feeToken,
        tokenAddresses,
        externalActionId,
        [],
        0n,
        solanaTransactionParams,
      );

      const hinkalVariableRate =
        resolvedRef.refVariableRate ??
        getHinkalVariableRate(res, isTransact ? ENCLAVE_TRANSACT_VARIABLE_RATE : ENCLAVE_SWAP_VARIABLE_RATE);

      const { keyId, partnerFeeBps } = getRequestAttribution(res, undefined);

      res.status(200).json({
        success: true,
        feeAmount: feeStructure.flatFee.toString(),
        hinkalVariableRateBps: Number(hinkalVariableRate),
        ...(keyId && { partnerFeeBps }),
        ...(breakdown && { breakdown }),
      });
    } catch (error) {
      res.status(500).json({ success: false, error: getErrorMessage(error) });
    }
  },
);

export default router;
