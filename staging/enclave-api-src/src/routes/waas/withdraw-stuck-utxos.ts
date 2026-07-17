import { Request, Response, Router } from 'express';
import { parseChainId, resolveToken } from '../../utils/transactionHelpers';
import { sendError } from '../../utils/routeError';
import { hinkalInitializerService } from '../../services/hinkalInitializerService';
import { xStampMiddleware } from '../../middleware';
import { requireActionPermission, resolveTargetUser } from '../../utils';
import { WaasPolicyAction } from '../../constants/policyActions';

const router = Router();

router.post('/waas/withdraw-stuck-utxos', xStampMiddleware, async (req: Request, res: Response) => {
  const { organizationId, userId, fromAddress, token: tokenAddress, chainId, recipientAddress } = req.body ?? {};

  if (!organizationId || !userId || !fromAddress || !tokenAddress || chainId === undefined || !recipientAddress) {
    res.status(400).send({
      status: 'error',
      message:
        'Missing required fields: organizationId, userId, fromAddress, token, chainId, recipientAddress, signerPublicKey, stampSignature',
    });
    return;
  }

  try {
    const signerPublicKey = res.locals.signerPublicKey as string;
    const signer = await resolveTargetUser(organizationId, userId, signerPublicKey);
    requireActionPermission(signer, WaasPolicyAction.SIGN_TRANSACTION);

    const parsedChainId = parseChainId(chainId);
    const token = resolveToken(tokenAddress, parsedChainId);
    const txHashes = await hinkalInitializerService.withHinkalForOrganization(
      organizationId,
      userId,
      signerPublicKey,
      fromAddress,
      parsedChainId,
      async (hinkal) => {
        return hinkal.withdrawStuckUtxos(token, String(recipientAddress));
      },
    );

    res.status(200).send({ status: 'success', data: { txHashes } });
  } catch (err) {
    sendError(res, err);
  }
});

export default router;
