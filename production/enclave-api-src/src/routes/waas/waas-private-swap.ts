import { Request, Response, Router } from 'express';
import { hasMissingSwapFields, resolveAndValidateSwapRequest } from '../../utils/transactionHelpers';
import { sendError } from '../../utils/routeError';
import { executePrivateBridgeSwap } from '../../services/executePrivateBridgeSwap';
import { executePrivateSwap } from '../../services/executePrivateSwap';
import { xStampMiddleware } from '../../middleware';
import { requireActionPermission, resolveTargetUser } from '../../utils';
import { WaasPolicyAction } from '../../constants/policyActions';
import { REQUIRED_SWAP_FIELDS_MESSAGE } from '../../constants/swap.constants';

const router = Router();

router.post('/waas/private-swap', xStampMiddleware, async (req: Request, res: Response) => {
  const { organizationId, userId, fromAddress, fromToken, toToken, amount, chainId, toChainId, slippagePercentage } =
    req.body ?? {};

  if (hasMissingSwapFields(req.body ?? {})) {
    res.status(400).send({ status: 'error', message: REQUIRED_SWAP_FIELDS_MESSAGE });
    return;
  }

  try {
    const signerPublicKey = res.locals.signerPublicKey as string;
    const signer = await resolveTargetUser(organizationId, userId, signerPublicKey);
    requireActionPermission(signer, WaasPolicyAction.SIGN_TRANSACTION);

    const { parsedChainId, isCrossChain, inToken, outToken, amountWei, parsedSlippage } = resolveAndValidateSwapRequest(
      fromToken,
      toToken,
      chainId,
      amount,
      slippagePercentage,
      toChainId,
    );

    const swapParams = {
      organizationId,
      userId,
      signerPublicKey,
      fromAddress,
      chainId: parsedChainId,
      inToken,
      outToken,
      amount: String(amount),
      amountWei,
      parsedSlippage,
    };

    if (isCrossChain) {
      const data = await executePrivateBridgeSwap(swapParams);
      res.status(200).send({ status: 'success', data });
      return;
    }

    const txHash = await executePrivateSwap(swapParams);
    res.status(200).send({ status: 'success', data: { txHash } });
  } catch (err) {
    sendError(res, err);
  }
});

export default router;
