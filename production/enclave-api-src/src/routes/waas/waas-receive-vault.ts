import { Request, Response, Router } from 'express';
import { parseChainId } from '../../utils/transactionHelpers';
import { parseQueryParams } from '../../utils/request.utils';
import { sendError } from '../../utils/routeError';
import { walletOwnershipMiddleware, xStampMiddleware } from '../../middleware';
import { requireActionPermission, resolveTargetUser } from '../../utils';
import { WaasPolicyAction } from '../../constants/policyActions';
import { getReceiveVaultFunds, recoverReceiveVaultFunds } from '../../services/receiveVaultFunds';

const router = Router();

router.get(
  '/waas/receive-vault-funds',
  xStampMiddleware,
  walletOwnershipMiddleware,
  async (req: Request, res: Response) => {
    const { organizationId, userId, walletAddress, chainId } = parseQueryParams<{
      organizationId: string;
      userId: string;
      walletAddress: string;
      chainId: string;
    }>(req);

    try {
      const data = await getReceiveVaultFunds({
        organizationId,
        userId,
        signerPublicKey: res.locals.signerPublicKey as string,
        fromAddress: walletAddress,
        chainId: parseChainId(chainId),
      });
      res.status(200).send({ status: 'success', data });
    } catch (err) {
      sendError(res, err);
    }
  },
);

router.post('/waas/recover-receive-vault-funds', xStampMiddleware, async (req: Request, res: Response) => {
  const { organizationId, userId, fromAddress, chainId } = req.body ?? {};

  if (!organizationId || !userId || !fromAddress || chainId === undefined) {
    res.status(400).send({
      status: 'error',
      message: 'Missing required fields: organizationId, userId, fromAddress, chainId, signerPublicKey, stampSignature',
    });
    return;
  }

  try {
    const signerPublicKey = res.locals.signerPublicKey as string;
    const signer = await resolveTargetUser(organizationId, userId, signerPublicKey);
    requireActionPermission(signer, WaasPolicyAction.SIGN_TRANSACTION);

    const data = await recoverReceiveVaultFunds({
      organizationId,
      userId,
      signerPublicKey,
      fromAddress,
      chainId: parseChainId(chainId),
    });

    res.status(200).send({ status: 'success', data });
  } catch (err) {
    sendError(res, err);
  }
});

export default router;
