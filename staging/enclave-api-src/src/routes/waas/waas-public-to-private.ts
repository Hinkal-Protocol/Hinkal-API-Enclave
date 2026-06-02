import { Request, Response, Router } from 'express';
import { depositClaimableUtxos } from '@hinkal/common';
import { constructStealthAddressStructure } from '@hinkal/common/functions/utils/addresses';
import { getAmountInWei } from '@hinkal/common/functions/web3/etherFunctions';
import { AdminTransactionType } from '@hinkal/common/types/admin.types';
import { parseChainId, resolvePrivateRecipient, resolveToken } from '../../utils/transactionHelpers';
import { sendError } from '../../utils/routeError';
import { ensureRecipientInfoPoolForApi } from '../../utils/ensureRecipientInfoPoolForApi';
import { reserveFallbackNonceRange } from '../../utils/claimableSend.utils';
import { hinkalInitializerService } from '../../services/hinkalInitializerService';
import { pendingEnclaveUtxoQueueService } from '../../services/pendingEnclaveUtxoQueueService';
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

    let txHash: string;
    if (recipientInfo) {
      txHash = (await hinkal.prooflessDeposit(
        [token],
        [amountWei],
        [constructStealthAddressStructure(recipientInfo)],
        AdminTransactionType.PayPublicToPrivateSend,
      )) as string;
    } else {
      const baseNonce = await reserveFallbackNonceRange(fromAddress, 1);
      const { txHash: claimableTxHash, pendingEnclaveUtxos } = await depositClaimableUtxos(
        hinkal,
        token,
        [amountWei],
        [String(to)],
        baseNonce,
        [undefined],
      );
      txHash = claimableTxHash;
      await pendingEnclaveUtxoQueueService.enqueueAndFlush(pendingEnclaveUtxos);
    }

    ensureRecipientInfoPoolForApi(organizationId, userId, fromAddress, signerPublicKey, parsedChainId);

    res.status(200).send({ status: 'success', data: { txHash } });
  } catch (err) {
    sendError(res, err);
  }
});

export default router;
