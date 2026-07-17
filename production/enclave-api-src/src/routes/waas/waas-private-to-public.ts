import { Request, Response, Router } from 'express';
import { isSolanaLike } from '@hinkal/common/constants/chains.constants';
import { HINKAL_PRIVATE_SEND_VARIABLE_RATE } from '@hinkal/common/constants/protocol.constants';
import { getFeeStructure } from '@hinkal/common/functions/pre-transaction/getFeeStructure';
import { getAmountInWei } from '@hinkal/common/functions/web3/etherFunctions';
import { calculateSolanaNullifierCount } from '@hinkal/common/functions/pre-transaction/calculateSolanaNullifierCount';
import { ExternalActionId } from '@hinkal/common/types/external-action.types';
import { parseChainId, resolveToken } from '../../utils/transactionHelpers';
import { sendError } from '../../utils/routeError';
import { ensureRecipientInfoPoolForApi } from '../../utils/ensureRecipientInfoPoolForApi';
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

    const tx = await hinkalInitializerService.withHinkalForOrganization(
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
            HINKAL_PRIVATE_SEND_VARIABLE_RATE,
            { mintTo: token.erc20TokenAddress, recipient: String(to), nullifierCount },
          );
        }

        return hinkal.withdraw(
          [token],
          [-amountWei],
          String(to),
          Boolean(isRelayerOff),
          token.erc20TokenAddress,
          feeStructureOverride,
        );
      },
    );

    ensureRecipientInfoPoolForApi(organizationId, userId, fromAddress, signerPublicKey, parsedChainId);

    res.status(200).send({
      status: 'success',
      data: { txHash: typeof tx === 'string' ? tx : tx.hash },
    });
  } catch (err) {
    sendError(res, err);
  }
});

export default router;
