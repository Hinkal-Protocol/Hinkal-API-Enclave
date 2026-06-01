import { Request, Response, Router } from 'express';
import { isSolanaLike } from '@hinkal/common/constants/chains.constants';
import { PAY_SEND_VARIABLE_RATE } from '@hinkal/common/constants/protocol.constants';
import { getFeeStructure } from '@hinkal/common/functions/pre-transaction/getFeeStructure';
import { getAmountInWei } from '@hinkal/common/functions/web3/etherFunctions';
import { AdminTransactionType } from '@hinkal/common/types/admin.types';
import { ExternalActionId } from '@hinkal/common/types/external-action.types';
import { parseChainId, resolveToken } from '../../utils/transactionHelpers';
import { sendError } from '../../utils/routeError';
import { ensureRecipientInfoPoolForApi } from '../../utils/ensureRecipientInfoPoolForApi';
import { hinkalInitializerService } from '../../services/hinkalInitializerService';
import { xStampMiddleware } from '../../middleware';

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
    const parsedChainId = parseChainId(chainId);
    const token = resolveToken(tokenAddress, parsedChainId);
    const hinkal = await hinkalInitializerService.initHinkalForOrganization(
      organizationId,
      userId,
      signerPublicKey,
      fromAddress,
      parsedChainId,
    );

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

    const txHash = await hinkal.depositAndWithdraw(
      token,
      [recipientAmount],
      [String(to)],
      undefined,
      feeStructure,
      undefined,
      AdminTransactionType.PayPublicToPublicSend,
    );

    ensureRecipientInfoPoolForApi(organizationId, userId, fromAddress, signerPublicKey, parsedChainId);

    res.status(200).send({ status: 'success', data: { txHash } });
  } catch (err) {
    sendError(res, err);
  }
});

export default router;
