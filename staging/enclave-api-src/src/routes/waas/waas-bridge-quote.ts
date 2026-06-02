import { Request, Response, Router } from 'express';
import { DEFAULT_BRIDGING_SLIPPAGE, getAmountInWei, getLifiPrice, randomBigInt } from '@hinkal/common';
import { sendError } from '../../utils/routeError';
import { hinkalInitializerService } from '../../services/hinkalInitializerService';
import { xStampMiddleware } from '../../middleware';
import { buildBridgeFeeStructure, deriveTemporarySubAccount, resolveBridgeTokens } from './waas-bridge.helpers';

const router = Router();

router.post('/waas/bridge-quote', xStampMiddleware, async (req: Request, res: Response) => {
  const {
    organizationId,
    userId,
    fromAddress,
    to,
    token: tokenAddress,
    amount,
    chainId,
    destinationChainId,
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

    const nonce = randomBigInt(31);
    const temporarySubAccount = deriveTemporarySubAccount(hinkal, parsedChainId, nonce);

    const { lifiDataValue, outSwapAmountValue, extraNativeTokenFee } = await getLifiPrice(
      token,
      destToken,
      String(amount),
      DEFAULT_BRIDGING_SLIPPAGE * 0.01,
      temporarySubAccount.ethAddress,
      String(to),
    );

    const bridgeAmount = getAmountInWei(token, String(amount));
    const quote = {
      calldata: lifiDataValue,
      expectedAmount: outSwapAmountValue,
      nativeFee: extraNativeTokenFee,
    };

    const feeResult = await buildBridgeFeeStructure(hinkal, parsedChainId, token, bridgeAmount, quote);
    if (feeResult.error || !feeResult.feeStructure) {
      res.status(feeResult.error?.status ?? 400).send({
        status: 'error',
        message: feeResult.error?.message ?? 'Failed to price bridge fee',
      });
      return;
    }

    const { feeStructure } = feeResult;

    res.status(200).send({
      status: 'success',
      data: {
        nonce: nonce.toString(),
        ethAddress: temporarySubAccount.ethAddress,
        recipientAddress: String(to),
        bridgeAmount: bridgeAmount.toString(),
        nativeFee: extraNativeTokenFee.toString(),
        quote: {
          calldata: lifiDataValue,
          expectedAmount: outSwapAmountValue.toString(),
          nativeFee: extraNativeTokenFee.toString(),
        },
        feeStructure: {
          feeToken: feeStructure.feeToken,
          flatFee: feeStructure.flatFee.toString(),
          variableRate: feeStructure.variableRate.toString(),
        },
      },
    });
  } catch (err) {
    sendError(res, err);
  }
});

export default router;
