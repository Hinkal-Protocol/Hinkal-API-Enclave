import { Request, Response, Router } from 'express';
import {
  AdminTransactionType,
  BridgeRecipient,
  DEFAULT_BRIDGING_SLIPPAGE,
  getAmountInWei,
  getLifiPrice,
  randomBigInt,
} from '@hinkal/common';
import { sendError } from '../../utils/routeError';
import { ensureRecipientInfoPoolForApi } from '../../utils/ensureRecipientInfoPoolForApi';
import { hinkalInitializerService } from '../../services/hinkalInitializerService';
import { xStampMiddleware } from '../../middleware';
import { buildBridgeFeeStructure, deriveTemporarySubAccount, resolveBridgeTokens } from './waas-bridge.helpers';

const router = Router();

router.post('/waas/bridge', xStampMiddleware, async (req: Request, res: Response) => {
  const {
    organizationId,
    userId,
    fromAddress,
    to,
    token: tokenAddress,
    amount,
    chainId,
    destinationChainId,
    subAccountNonce: nonceFromClient,
    quote: quoteFromClient,
  } = req.body ?? {};

  if (
    !organizationId ||
    !userId ||
    !fromAddress ||
    !to ||
    !tokenAddress ||
    !amount ||
    chainId === undefined ||
    destinationChainId === undefined
  ) {
    res.status(400).send({
      status: 'error',
      message:
        'Missing required fields: organizationId, userId, fromAddress, to, token, amount, chainId, destinationChainId',
    });
    return;
  }

  try {
    const signerPublicKey = res.locals.signerPublicKey as string;

    const { error, token, destToken, parsedChainId } = resolveBridgeTokens(tokenAddress, chainId, destinationChainId);
    if (error || !token || !destToken || parsedChainId === undefined) {
      res.status(error?.status ?? 400).send({ status: 'error', message: error?.message ?? 'Invalid bridge request' });
      return;
    }

    const hinkal = await hinkalInitializerService.initHinkalForOrganization(
      organizationId,
      userId,
      signerPublicKey,
      fromAddress,
      parsedChainId,
    );

    const bridgeAmount = getAmountInWei(token, String(amount));

    const hasClientQuote = nonceFromClient !== undefined && nonceFromClient !== null && !!quoteFromClient;
    const nonce = hasClientQuote ? BigInt(nonceFromClient) : randomBigInt(31);
    const temporarySubAccount = deriveTemporarySubAccount(hinkal, parsedChainId, nonce);

    const quote = hasClientQuote
      ? {
          calldata: String(quoteFromClient.calldata),
          expectedAmount: BigInt(quoteFromClient.expectedAmount),
          nativeFee: BigInt(quoteFromClient.nativeFee),
        }
      : await getLifiPrice(
          token,
          destToken,
          String(amount),
          DEFAULT_BRIDGING_SLIPPAGE * 0.01,
          temporarySubAccount.ethAddress,
          String(to),
        ).then(({ lifiDataValue, outSwapAmountValue, extraNativeTokenFee }) => ({
          calldata: lifiDataValue,
          expectedAmount: outSwapAmountValue,
          nativeFee: extraNativeTokenFee,
        }));

    const bridgeRecipient: BridgeRecipient = {
      recipientAddress: String(to),
      bridgeAmount,
      quote,
      temporarySubAccount,
    };

    const feeResult = await buildBridgeFeeStructure(hinkal, parsedChainId, token, bridgeAmount, quote);
    if (feeResult.error) {
      res.status(feeResult.error.status).send({ status: 'error', message: feeResult.error.message });
      return;
    }

    const txHash = await hinkal.depositAndBridge(
      token,
      [bridgeRecipient],
      undefined,
      feeResult.feeStructure,
      undefined,
      AdminTransactionType.PayPublicToPublicBridgeSend,
    );

    ensureRecipientInfoPoolForApi(organizationId, userId, fromAddress, signerPublicKey, parsedChainId);

    res.status(200).send({ status: 'success', data: { txHash } });
  } catch (err) {
    sendError(res, err);
  }
});

export default router;
