import { Request, Response, Router } from 'express';
import { constructStealthAddressStructure } from '@hinkal/common/functions/utils/addresses';
import { getAmountInWei } from '@hinkal/common/functions/web3/etherFunctions';
import { parseChainId, resolvePrivateRecipient, resolveToken } from '../../utils/transactionHelpers';
import { sendError } from '../../utils/routeError';
import { ensureRecipientInfoPoolForApi } from '../../utils/ensureRecipientInfoPoolForApi';
import { hinkalInitializerService } from '../../services/hinkalInitializerService';
import { xStampMiddleware } from '../../middleware';

const router = Router();

router.post('/waas/public-to-private', xStampMiddleware, async (req: Request, res: Response) => {
  const { organizationId, userId, fromAddress, to, token: tokenAddress, amount, chainId } = req.body ?? {};

  if (!organizationId || !userId || !fromAddress || !to || !tokenAddress || !amount || chainId === undefined) {
    res.status(400).send({
      status: 'error',
      message: 'Missing required fields: organizationId, userId, fromAddress, to, token, amount, chainId',
    });
    return;
  }

  try {
    const signerPublicKey = res.locals.signerPublicKey as string;
    const parsedChainId = parseChainId(chainId);
    const token = resolveToken(tokenAddress, parsedChainId);
    const recipientInfo = await resolvePrivateRecipient(String(to));
    const hinkal = await hinkalInitializerService.initHinkalForOrganization(
      organizationId,
      userId,
      signerPublicKey,
      fromAddress,
      parsedChainId,
    );

    const amountWei = getAmountInWei(token, String(amount));
    const txHash = await hinkal.prooflessDeposit(
      [token],
      [amountWei],
      [constructStealthAddressStructure(recipientInfo)],
    );

    ensureRecipientInfoPoolForApi(organizationId, userId, fromAddress, signerPublicKey, parsedChainId);

    res.status(200).send({ status: 'success', data: { txHash } });
  } catch (err) {
    sendError(res, err);
  }
});

export default router;
