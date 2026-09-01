import { Request, Response, Router } from 'express';
import { isSolanaLike } from '@hinkal/common/constants/chains.constants';
import { PAY_SEND_VARIABLE_RATE } from '@hinkal/common/constants/protocol.constants';
import { getFeeStructure } from '@hinkal/common/functions/pre-transaction/getFeeStructure';
import { getAmountInWei } from '@hinkal/common/functions/web3/etherFunctions';
import { ExternalActionId } from '@hinkal/common/types/external-action.types';
import { parseChainId, resolveToken } from '../../utils/transactionHelpers';
import { sendError } from '../../utils/routeError';
import { ensureRecipientInfoPoolForApiInBackground } from '../../utils/ensureRecipientInfoPoolForApi';
import { hinkalInitializerService } from '../../services/hinkalInitializerService';
import { xStampMiddleware } from '../../middleware';
import { requireActionPermission, resolveTargetUser } from '../../utils';
import { WaasPolicyAction } from '../../constants/policyActions';

const router = Router();

router.post('/waas/public-to-public', xStampMiddleware, async (req: Request, res: Response) => {
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
    const recipientAmount = getAmountInWei(token, String(amount));

    // depositAndWithdraw creates exactly 1 fresh UTXO and immediately spends it,
    // so nullifierCount is always 1 regardless of existing private balance.
    const solanaParams = isSolanaLike(parsedChainId)
      ? { mintTo: token.erc20TokenAddress, recipient: String(to), nullifierCount: 1 }
      : undefined;

    const feeStructure = await getFeeStructure(
      parsedChainId,
      token.erc20TokenAddress,
      [token.erc20TokenAddress],
      ExternalActionId.Transact,
      [],
      PAY_SEND_VARIABLE_RATE,
      solanaParams,
    );

    const { depositTxHash, scheduleId } = await hinkalInitializerService.withHinkalForOrganization(
      organizationId,
      userId,
      signerPublicKey,
      fromAddress,
      parsedChainId,
      async (hinkal) => {
        return hinkal.depositAndWithdraw(token, [recipientAmount], [String(to)], undefined, feeStructure);
      },
    );

    ensureRecipientInfoPoolForApiInBackground(organizationId, userId, fromAddress, signerPublicKey, parsedChainId);

    res.status(200).send({ status: 'success', data: { txHash: depositTxHash, scheduleId } });
  } catch (err) {
    sendError(res, err);
  }
});

export default router;
