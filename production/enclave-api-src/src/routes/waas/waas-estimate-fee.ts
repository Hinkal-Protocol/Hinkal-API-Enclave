import { Request, Response, Router } from 'express';
import { parseChainId, resolveAndValidateSwapRequest, resolveToken } from '../../utils/transactionHelpers';
import { resolveBridgeSlippagePercent } from '../../utils/bridgeSlippage';
import { sendError } from '../../utils/routeError';
import { hinkalInitializerService } from '../../services/hinkalInitializerService';
import { estimatePrivateBridgeFee, estimatePrivateSwapFee, estimateSpendFee } from '../../services/estimateWaasFees';
import { xStampMiddleware } from '../../middleware';
import { resolveTargetUser } from '../../utils';
import { WaasSpendFeeAction } from '../../types';
import { PERCENT_TO_DECIMAL } from '../../constants/swap.constants';
import { WaasFeeEstimateAction } from '@hinkal/common/types/enclaveApi.types';

const router = Router();

router.post('/waas/estimate-fee', xStampMiddleware, async (req: Request, res: Response) => {
  const {
    organizationId,
    userId,
    fromAddress,
    action,
    chainId,
    token: tokenAddress,
    amount,
    to,
    toToken,
    toChainId,
    slippagePercentage,
  } = req.body ?? {};

  if (!organizationId || !userId || !fromAddress || !tokenAddress || !amount || chainId === undefined) {
    res.status(400).send({
      status: 'error',
      message: 'Missing required fields: organizationId, userId, fromAddress, token, amount, chainId',
    });
    return;
  }
  if (!Object.values<string>(WaasFeeEstimateAction).includes(action)) {
    res.status(400).send({
      status: 'error',
      message: `action must be one of: ${Object.values(WaasFeeEstimateAction).join(', ')}`,
    });
    return;
  }
  if (action === WaasFeeEstimateAction.PrivateSwap && !toToken) {
    res.status(400).send({ status: 'error', message: 'toToken is required for private_swap' });
    return;
  }

  try {
    const signerPublicKey = res.locals.signerPublicKey as string;
    await resolveTargetUser(organizationId, userId, signerPublicKey);

    const parsedChainId = parseChainId(chainId);
    const estimate = await hinkalInitializerService.withHinkalForOrganization(
      organizationId,
      userId,
      signerPublicKey,
      fromAddress,
      parsedChainId,
      async (hinkal) => {
        if (action !== WaasFeeEstimateAction.PrivateSwap) {
          const token = resolveToken(tokenAddress, parsedChainId);
          return estimateSpendFee(
            hinkal,
            action as WaasSpendFeeAction,
            token,
            String(amount),
            String(to ?? fromAddress),
          );
        }

        const { isCrossChain, inToken, outToken, parsedSlippage } = resolveAndValidateSwapRequest(
          tokenAddress,
          toToken,
          parsedChainId,
          amount,
          slippagePercentage,
          toChainId,
        );
        if (!isCrossChain) return estimatePrivateSwapFee(hinkal, inToken, outToken, String(amount), parsedSlippage);

        const slippage =
          (await resolveBridgeSlippagePercent(inToken, String(amount), parsedSlippage)) * PERCENT_TO_DECIMAL;
        return estimatePrivateBridgeFee(hinkal, inToken, outToken, String(amount), slippage);
      },
    );

    res.status(200).send({
      status: 'success',
      data: {
        feeToken: estimate.feeToken.erc20TokenAddress,
        fee: estimate.fee.toString(),
        nativeFee: estimate.nativeFee.toString(),
      },
    });
  } catch (err) {
    sendError(res, err);
  }
});

export default router;
