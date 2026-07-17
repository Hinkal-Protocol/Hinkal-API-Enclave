import { Request, Response, Router } from 'express';
import { isSolanaLike } from '@hinkal/common/constants/chains.constants';
import { HttpError } from '@hinkal/common';
import { parseChainId } from '../../utils/transactionHelpers';
import { buildSolanaSigner, signAndSendSerializedSolanaTransaction } from '../../utils/solana-wallet.utils';
import { sendError } from '../../utils/routeError';
import { xStampMiddleware } from '../../middleware';
import { requireActionPermission, resolveTargetUser } from '../../utils';
import { WaasPolicyAction } from '../../constants/policyActions';

const router = Router();

router.post('/waas/wallet/solana/execute', xStampMiddleware, async (req: Request, res: Response) => {
  const { organizationId, userId, fromAddress, chainId, transaction } = req.body ?? {};

  if (!organizationId || !userId || !fromAddress || chainId === undefined || !transaction) {
    res.status(400).send({
      status: 'error',
      message:
        'Missing required fields: organizationId, userId, fromAddress, chainId, transaction (base64 serialized VersionedTransaction)',
    });
    return;
  }

  try {
    const signerPublicKey = res.locals.signerPublicKey as string;
    const authorizedUser = await resolveTargetUser(organizationId, userId, signerPublicKey);
    requireActionPermission(authorizedUser, WaasPolicyAction.SIGN_TRANSACTION);

    const parsedChainId = parseChainId(chainId);
    if (!isSolanaLike(parsedChainId)) throw new HttpError(400, 'chainId is not a Solana chain');

    const { signer, connection } = await buildSolanaSigner(
      signerPublicKey,
      organizationId,
      userId,
      fromAddress,
      parsedChainId,
    );
    const txHash = await signAndSendSerializedSolanaTransaction(connection, signer, String(transaction));
    res.status(200).send({ status: 'success', data: { txHash } });
  } catch (err) {
    sendError(res, err);
  }
});

export default router;
