import { Request, Response, Router } from 'express';
import { BRIDGE_SUPPORTED_CHAINS, isEvmChain } from '@hinkal/common';
import { parseChainId } from '../../utils/transactionHelpers';
import { sendError } from '../../utils/routeError';
import { xStampMiddleware } from '../../middleware';
import { requireActionPermission, resolveTargetUser } from '../../utils';
import { WaasPolicyAction } from '../../constants/policyActions';
import { recoverTemporaryWalletFunds } from '../../services/recoverTemporaryWalletFunds';

const router = Router();

router.post('/waas/recover-temporary-wallet-funds', xStampMiddleware, async (req: Request, res: Response) => {
  const { organizationId, userId, fromAddress, chainId } = req.body ?? {};

  if (!organizationId || !userId || !fromAddress) {
    res.status(400).send({
      status: 'error',
      message: 'Missing required fields: organizationId, userId, fromAddress, signerPublicKey, stampSignature',
    });
    return;
  }

  try {
    const signerPublicKey = res.locals.signerPublicKey as string;
    const signer = await resolveTargetUser(organizationId, userId, signerPublicKey);
    requireActionPermission(signer, WaasPolicyAction.SIGN_TRANSACTION);

    const chainIds = chainId !== undefined ? [parseChainId(chainId)] : BRIDGE_SUPPORTED_CHAINS.filter(isEvmChain);

    const data = await recoverTemporaryWalletFunds({
      organizationId,
      userId,
      signerPublicKey,
      fromAddress,
      chainIds,
    });

    res.status(200).send({ status: 'success', data });
  } catch (err) {
    sendError(res, err);
  }
});

export default router;
