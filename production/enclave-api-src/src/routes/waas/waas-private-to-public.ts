import { Request, Response, Router } from 'express';
import { ENCLAVE_UNSHIELD_VARIABLE_RATE } from '@hinkal/common/constants/protocol.constants';
import { getAmountInWei } from '@hinkal/common/functions/web3/etherFunctions';
import { toTxHash } from '@hinkal/common/functions/utils/tx-confirmation.utils';
import { parseChainId, resolveToken } from '../../utils/transactionHelpers';
import { sendError } from '../../utils/routeError';
import { ensureRecipientInfoPoolForApiInBackground } from '../../utils/ensureRecipientInfoPoolForApi';
import { hinkalInitializerService } from '../../services/hinkalInitializerService';
import { xStampMiddleware } from '../../middleware';
import { requireActionPermission, resolveTargetUser } from '../../utils';
import { WaasPolicyAction } from '../../constants/policyActions';

const router = Router();

router.post('/waas/private-to-public', xStampMiddleware, async (req: Request, res: Response) => {
  const {
    organizationId,
    userId,
    fromAddress,
    to,
    token: tokenAddress,
    amount,
    chainId,
    isRelayerOff,
  } = req.body ?? {};

  if (!organizationId || !userId || !fromAddress || !to || !tokenAddress || !amount || chainId === undefined) {
    res.status(400).send({
      status: 'error',
      message: 'Missing required fields: organizationId, userId, fromAddress, to, token, amount, chainId',
    });
    return;
  }

  try {
    const signerPublicKey = res.locals.signerPublicKey as string;
    const signer = await resolveTargetUser(organizationId, userId, signerPublicKey);
    requireActionPermission(signer, WaasPolicyAction.SIGN_TRANSACTION);

    const parsedChainId = parseChainId(chainId);
    const token = resolveToken(tokenAddress, parsedChainId);

    const amountWei = getAmountInWei(token, String(amount));

    const tx = await hinkalInitializerService.withShieldedSpendForOrganization(
      organizationId,
      userId,
      signerPublicKey,
      fromAddress,
      parsedChainId,
      (hinkal) =>
        hinkal.withdraw(
          [token],
          [-amountWei],
          String(to),
          Boolean(isRelayerOff),
          token.erc20TokenAddress,
          undefined,
          ENCLAVE_UNSHIELD_VARIABLE_RATE,
        ),
      (result) => [toTxHash(result)],
    );

    ensureRecipientInfoPoolForApiInBackground(organizationId, userId, fromAddress, signerPublicKey, parsedChainId);

    res.status(200).send({
      status: 'success',
      data: { txHash: toTxHash(tx) },
    });
  } catch (err) {
    sendError(res, err);
  }
});

export default router;
