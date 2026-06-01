import { Request, Response, Router } from 'express';
import { parseChainId, resolveToken } from '../../utils/transactionHelpers';
import { sendError } from '../../utils/routeError';
import { hinkalInitializerService } from '../../services/hinkalInitializerService';
import { xStampMiddleware } from '../../middleware';

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
    const parsedChainId = parseChainId(chainId);
    const token = resolveToken(tokenAddress, parsedChainId);
    const hinkal = await hinkalInitializerService.initHinkalForOrganization(
      organizationId,
      userId,
      signerPublicKey,
      fromAddress,
      parsedChainId,
    );

    const txHashes = await hinkal.withdrawStuckUtxos(token, String(recipientAddress));

    res.status(200).send({ status: 'success', data: { txHashes } });
  } catch (err) {
    sendError(res, err);
  }
});

export default router;
