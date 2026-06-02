import { Request, Response, Router } from 'express';
import {
  AccountActions,
  AdminTransactionType,
  BridgeRecipient,
  caseInsensitiveEqual,
  convertEmporiumOpToCallInfo,
  createLifiBridgeOps,
  DEFAULT_BRIDGING_SLIPPAGE,
  ExternalActionId,
  getAmountInWei,
  getEquivalentNativeToken,
  getErc20TokensForChain,
  getFeeStructure,
  getLifiPrice,
  isSolanaLike,
  isTronLike,
  networkRegistry,
  PAY_SEND_VARIABLE_RATE,
  randomBigInt,
  SWAP_ROUTER_ADDRESSES,
  TemporarySubAccount,
  zeroAddress,
} from '@hinkal/common';
import { parseChainId, resolveToken } from '../../utils/transactionHelpers';
import { sendError } from '../../utils/routeError';
import { ensureRecipientInfoPoolForApi } from '../../utils/ensureRecipientInfoPoolForApi';
import { hinkalInitializerService } from '../../services/hinkalInitializerService';
import { xStampMiddleware } from '../../middleware';

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
    const parsedChainId = parseChainId(chainId);
    const parsedDestChainId = parseChainId(destinationChainId);

    if (parsedChainId === parsedDestChainId) {
      res.status(400).send({
        status: 'error',
        message: 'destinationChainId must differ from chainId for a bridge',
      });
      return;
    }

    // Solana/Tron bridge fee accounting differs; this route supports EVM emporium bridging only.
    if (
      isSolanaLike(parsedChainId) ||
      isTronLike(parsedChainId) ||
      isSolanaLike(parsedDestChainId) ||
      isTronLike(parsedDestChainId)
    ) {
      res.status(400).send({ status: 'error', message: 'Bridge only supported between EVM chains' });
      return;
    }

    const token = resolveToken(tokenAddress, parsedChainId);

    // Resolve the equivalent destination-chain token (same symbol, or native equivalent).
    const destTokenList = getErc20TokensForChain(parsedDestChainId);
    const isNativeSource = caseInsensitiveEqual(token.erc20TokenAddress, zeroAddress);
    const destToken = isNativeSource
      ? getEquivalentNativeToken(parsedChainId, parsedDestChainId, destTokenList)
      : destTokenList.find((t) => caseInsensitiveEqual(t.symbol, token.symbol));

    if (!destToken) {
      res.status(400).send({
        status: 'error',
        message: `${token.symbol} has no equivalent token on the destination chain`,
      });
      return;
    }

    const hinkal = await hinkalInitializerService.initHinkalForOrganization(
      organizationId,
      userId,
      signerPublicKey,
      fromAddress,
      parsedChainId,
    );

    // Derive a one-off sub-account that holds the bridged funds on the source chain.
    const nonce = randomBigInt(31);
    const walletPrivateKey = hinkal.userKeys.getSignerPrivateKeyFromNonce(nonce);
    const ethAddress = AccountActions.getSignerAddressFromPrivateKey(parsedChainId, walletPrivateKey);
    const temporarySubAccount: TemporarySubAccount = {
      index: Number(nonce),
      ethAddress,
      privateKey: walletPrivateKey,
    };

    const { lifiDataValue, outSwapAmountValue, extraNativeTokenFee } = await getLifiPrice(
      token,
      destToken,
      String(amount),
      DEFAULT_BRIDGING_SLIPPAGE * 0.01,
      temporarySubAccount.ethAddress,
      String(to),
    );

    const bridgeAmount = getAmountInWei(token, String(amount));
    const bridgeRecipient: BridgeRecipient = {
      recipientAddress: String(to),
      bridgeAmount,
      quote: {
        calldata: lifiDataValue,
        expectedAmount: outSwapAmountValue,
        nativeFee: extraNativeTokenFee,
      },
      temporarySubAccount,
    };

    // Build the emporium fund/approve/bridge ops to price the fee structure.
    const { emporiumAddress } = networkRegistry[parsedChainId].contractData;
    const lifiRouterAddress = SWAP_ROUTER_ADDRESSES[ExternalActionId.Lifi][parsedChainId];
    if (!emporiumAddress || !lifiRouterAddress) {
      res.status(400).send({ status: 'error', message: 'Bridge is not configured for this chain' });
      return;
    }

    const ops = createLifiBridgeOps(
      hinkal,
      parsedChainId,
      emporiumAddress,
      lifiRouterAddress,
      token.erc20TokenAddress,
      bridgeAmount,
      bridgeAmount,
      bridgeRecipient.quote,
    );
    const calls = ops.map((op) => convertEmporiumOpToCallInfo(op, emporiumAddress, parsedChainId));

    const feeStructure = await getFeeStructure(
      parsedChainId,
      token.erc20TokenAddress,
      [token.erc20TokenAddress],
      ExternalActionId.Emporium,
      calls,
      PAY_SEND_VARIABLE_RATE,
    );

    const txHash = await hinkal.depositAndBridge(
      token,
      [bridgeRecipient],
      undefined,
      feeStructure,
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
