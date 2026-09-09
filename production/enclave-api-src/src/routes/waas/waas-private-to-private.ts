import { Request, Response, Router } from 'express';
import { isSolanaLike } from '@hinkal/common/constants/chains.constants';
import { ENCLAVE_PRIVATE_SEND_VARIABLE_RATE } from '@hinkal/common/constants/protocol.constants';
import { getFeeStructure } from '@hinkal/common/functions/pre-transaction/getFeeStructure';
import { getAmountInWei } from '@hinkal/common/functions/web3/etherFunctions';
import { calculateSolanaNullifierCount } from '@hinkal/common/functions/pre-transaction/calculateSolanaNullifierCount';
import { ExternalActionId } from '@hinkal/common/types/external-action.types';
import { parseChainId, resolvePrivateRecipient, resolveToken } from '../../utils/transactionHelpers';
import { sendError } from '../../utils/routeError';
import { hinkalInitializerService } from '../../services/hinkalInitializerService';
import { ensureRecipientInfoPoolForApiInBackground } from '../../utils/ensureRecipientInfoPoolForApi';
import { xStampMiddleware } from '../../middleware';
import { requireActionPermission, resolveTargetUser } from '../../utils';
import { WaasPolicyAction } from '../../constants/policyActions';

const router = Router();

router.post('/waas/private-to-private', xStampMiddleware, async (req: Request, res: Response) => {
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
    const signer = await resolveTargetUser(organizationId, userId, signerPublicKey);
    requireActionPermission(signer, WaasPolicyAction.SIGN_TRANSACTION);

    const parsedChainId = parseChainId(chainId);
    const token = resolveToken(tokenAddress, parsedChainId);
    const recipientInfo = await resolvePrivateRecipient(String(to));

    const amountWei = getAmountInWei(token, String(amount));
    const txHash = await hinkalInitializerService.withHinkalForOrganization(
      organizationId,
      userId,
      signerPublicKey,
      fromAddress,
      parsedChainId,
      async (hinkal) => {
        let feeStructureOverride: Awaited<ReturnType<typeof getFeeStructure>> | undefined;
        if (isSolanaLike(parsedChainId)) {
          const nullifierCount = await calculateSolanaNullifierCount(
            hinkal,
            parsedChainId,
            [token.erc20TokenAddress],
            [-amountWei],
          );
          feeStructureOverride = await getFeeStructure(
            parsedChainId,
            token.erc20TokenAddress,
            [token.erc20TokenAddress],
            ExternalActionId.Transact,
            [],
            ENCLAVE_PRIVATE_SEND_VARIABLE_RATE,
            { mintTo: token.erc20TokenAddress, nullifierCount },
          );
        } else {
          feeStructureOverride = await getFeeStructure(
            parsedChainId,
            token.erc20TokenAddress,
            [token.erc20TokenAddress],
            ExternalActionId.Transact,
            [],
            ENCLAVE_PRIVATE_SEND_VARIABLE_RATE,
          );
        }

        return hinkal.transfer([token], [-amountWei], recipientInfo, token.erc20TokenAddress, feeStructureOverride);
      },
    );

    ensureRecipientInfoPoolForApiInBackground(organizationId, userId, fromAddress, signerPublicKey, parsedChainId);

    res.status(200).send({ status: 'success', data: { txHash } });
  } catch (err) {
    sendError(res, err);
  }
});

export default router;
