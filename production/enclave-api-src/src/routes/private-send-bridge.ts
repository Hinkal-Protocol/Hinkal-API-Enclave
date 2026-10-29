import {
  API_ERROR_MESSAGES,
  BRIDGE_SUPPORTED_CHAINS,
  caseInsensitiveEqual,
  ENCLAVE_PUBLIC_SEND_VARIABLE_RATE,
  getBridgeDestinationChains,
  getDepositAndBridgeQuote,
  GetPrivateSendBridgeQuoteResponse,
  hinkalLifiBridgeDepositPrepare,
  HttpError,
  isValidAddressForChain,
  Logger,
  PrivateSendBridgeResponse,
  secondsToMs,
  toBase58IfTron,
} from '@hinkal/common';
import { Request, Response, Router } from 'express';
import {
  getHinkalVariableRate,
  getPartnerFeeBps,
  getRequestAttribution,
  partnerKeyMiddleware,
  verifyPrivateSendBridgeSignatureMiddleware,
  verifyReadOnlySignatureMiddleware,
} from '../middleware';
import { GetPrivateSendBridgeQuoteRequest, PrivateSendBridgeRequest } from '../types';
import { WHITELISTED_REFERRALS } from '@hinkal/backend-common';
import { hinkalInitializerService } from '../services/hinkalInitializerService';
import {
  assertQuoteMatchesRequest,
  parsePrivateSendBridgeQuote,
  serializePrivateSendBridgeQuote,
} from '../utils/privateSendBridgeQuote';
import { getERC20Token } from '@hinkal/erc20-registry';
import {
  createDepositAndWithdrawOrder,
  getDepositAndWithdrawFeeStructure,
  prepareDepositAndWithdrawTx,
  serializeEvmTx,
} from '../utils/depositAndWithdrawHelpers';
import { getDepositAndWithdrawOrderStatus } from '../utils/getDepositAndWithdrawOrderStatus';
import { INVALID_AMOUNTS_ERROR, isPositiveAmountList, parseSlippagePercentage } from '../utils/transactionHelpers';
import { resolveRouteError } from '../utils/routeError';
import { invalidAddressMessage } from '../utils/queryGuards';
import { encryptLargeField } from '../utils/orderFieldEncryption';
import { PRIVATE_SEND_BRIDGE_QUOTE_TTL_MS } from '../constants/swap.constants';

const router = Router();

router.get(
  '/get-private-send-bridge-quote',
  verifyReadOnlySignatureMiddleware,
  async (req: Request, res: Response<GetPrivateSendBridgeQuoteResponse>) => {
    try {
      const { inputTokenAddress, outputTokenAddress, slippagePercentage, txCompletionTime } =
        req.query as unknown as GetPrivateSendBridgeQuoteRequest;
      const chainId = Number(req.query.chainId);
      const destinationChainId = Number(req.query.destinationChainId);
      const recipientAddresses = ([] as string[])
        .concat((req.query.recipientAddresses as string | string[]) ?? [])
        .map((address) => (typeof address === 'string' ? toBase58IfTron(destinationChainId, address) : address));
      const amounts = ([] as string[]).concat((req.query.amounts as string | string[]) ?? []);

      if (
        !chainId ||
        !destinationChainId ||
        !inputTokenAddress ||
        !outputTokenAddress ||
        !recipientAddresses.length ||
        recipientAddresses.length !== amounts.length
      ) {
        res.status(400).json({ success: false, error: 'Missing required bridge parameters' });
        return;
      }

      if (!isPositiveAmountList(amounts)) {
        res.status(400).json({ success: false, error: INVALID_AMOUNTS_ERROR });
        return;
      }

      if (
        !BRIDGE_SUPPORTED_CHAINS.includes(chainId) ||
        !getBridgeDestinationChains(chainId).includes(destinationChainId)
      ) {
        res.status(400).json({
          success: false,
          error: `Bridging from chain ${chainId} to chain ${destinationChainId} is not supported`,
        });
        return;
      }

      if (recipientAddresses.some((address) => !isValidAddressForChain(destinationChainId, address))) {
        res
          .status(400)
          .json({ success: false, error: invalidAddressMessage('recipientAddresses', destinationChainId) });
        return;
      }

      const inToken = getERC20Token(inputTokenAddress, chainId);
      const outToken = getERC20Token(outputTokenAddress, destinationChainId);

      if (!inToken || !outToken) {
        res.status(400).json({ success: false, error: 'Token not found on source or destination chain' });
        return;
      }

      if (
        chainId === destinationChainId &&
        caseInsensitiveEqual(inToken.erc20TokenAddress, outToken.erc20TokenAddress)
      ) {
        res.status(400).json({
          success: false,
          error: 'inputTokenAddress and outputTokenAddress must be different tokens when swapping on the same chain',
        });
        return;
      }

      const parsedTxCompletionTime = txCompletionTime === undefined ? undefined : Number(txCompletionTime);
      if (
        parsedTxCompletionTime !== undefined &&
        !(Number.isInteger(parsedTxCompletionTime) && parsedTxCompletionTime > 0)
      ) {
        res.status(400).json({ success: false, error: 'Invalid txCompletionTime' });
        return;
      }

      const parsedSlippage = parseSlippagePercentage(slippagePercentage);
      const quote = await hinkalInitializerService.withHinkalForAddress(res.locals.address, chainId, async (hinkal) =>
        getDepositAndBridgeQuote(
          hinkal,
          inToken,
          outToken,
          amounts.map(BigInt),
          recipientAddresses,
          parsedSlippage,
          parsedTxCompletionTime,
        ),
      );

      res.status(200).json({
        success: true,
        quote: serializePrivateSendBridgeQuote(res.locals.address, quote, parsedTxCompletionTime),
        expectedAmounts: quote.expectedAmounts.map((amount) => amount.toString()),
      });
    } catch (error) {
      Logger.error('[get-private-send-bridge-quote] error:', error);
      const { status, message } = resolveRouteError(error);
      res.status(status).json({ success: false, error: message });
    }
  },
);

router.post(
  '/private-send-bridge',
  verifyPrivateSendBridgeSignatureMiddleware,
  partnerKeyMiddleware,
  async (
    req: Request<object, PrivateSendBridgeResponse, PrivateSendBridgeRequest>,
    res: Response<PrivateSendBridgeResponse>,
  ) => {
    const { chainId, tokenAddress, destinationChainId, destinationTokenAddress, recipients, quote, ref } =
      req.body as PrivateSendBridgeRequest;
    const address = res.locals.address as string;

    if (!chainId || !tokenAddress || !destinationChainId || !destinationTokenAddress || !recipients?.length || !quote) {
      res.status(400).json({
        success: false,
        error:
          'Missing required fields: chainId, tokenAddress, destinationChainId, destinationTokenAddress, recipients, quote',
      });
      return;
    }

    if (!Array.isArray(recipients) || !isPositiveAmountList(recipients.map((r) => r?.amount))) {
      res.status(400).json({ success: false, error: INVALID_AMOUNTS_ERROR });
      return;
    }

    if (ref !== undefined && !WHITELISTED_REFERRALS.includes(ref)) {
      res.status(400).json({ success: false, error: `Invalid ref: '${ref}' is not a whitelisted referral` });
      return;
    }

    try {
      const token = getERC20Token(tokenAddress, chainId);
      if (!token) {
        res.status(400).json({ success: false, error: `Token ${tokenAddress} not found on chain ${chainId}` });
        return;
      }

      const orderId = crypto.randomUUID();
      const variableRate = getHinkalVariableRate(res, ENCLAVE_PUBLIC_SEND_VARIABLE_RATE) + getPartnerFeeBps(res);

      const { serializedTx, utxoAmounts, orderRecipients, feeStructure, expectedAmountOut, txCompletionTime } =
        await hinkalInitializerService.withHinkalForAddress(address, chainId, async (hinkal) => {
          const decoded = parsePrivateSendBridgeQuote(hinkal, quote, address, chainId, token.erc20TokenAddress);
          if (Date.now() - decoded.issuedAt > PRIVATE_SEND_BRIDGE_QUOTE_TTL_MS) {
            throw new HttpError(400, API_ERROR_MESSAGES.QUOTE_EXPIRED);
          }
          assertQuoteMatchesRequest(decoded.quote, destinationChainId, destinationTokenAddress, recipients);
          const { lifiRecipients, nearLegs = [], expectedAmounts } = decoded.quote;
          const quotedAmountOut = expectedAmounts.reduce((sum, amount) => sum + amount, 0n);

          // EVM sources bridge through LIFI, which runs from a temporary wallet once the deposit lands.
          if (lifiRecipients?.length) {
            const result = await hinkalLifiBridgeDepositPrepare(hinkal, token, lifiRecipients, variableRate, orderId);
            return {
              serializedTx: serializeEvmTx(result.unsignedTx),
              utxoAmounts: result.utxoAmounts,
              orderRecipients: lifiRecipients.map((r) => ({
                address: r.recipientAddress,
                amount: r.bridgeAmount.toString(),
              })),
              feeStructure: result.feeStructure,
              expectedAmountOut: quotedAmountOut,
              txCompletionTime: decoded.txCompletionTime,
            };
          }

          // Solana/Tron sources bridge through NEAR Intents: a private send to the 1Click deposit addresses.
          const executionTimeMs = secondsToMs(decoded.txCompletionTime);
          if (nearLegs.some((leg) => leg.quote.deadline && new Date(leg.quote.deadline).getTime() < executionTimeMs)) {
            throw new HttpError(400, API_ERROR_MESSAGES.BRIDGE_QUOTE_EXPIRES_BEFORE_EXECUTION);
          }

          const nearRecipients = nearLegs.map((leg) => ({
            address: leg.depositAddress,
            amount: leg.amount.toString(),
          }));
          const nearFeeStructure = await getDepositAndWithdrawFeeStructure(
            chainId,
            token.erc20TokenAddress,
            token,
            nearRecipients,
            variableRate,
          );
          return {
            ...(await prepareDepositAndWithdrawTx(
              hinkal,
              chainId,
              token,
              nearLegs.map((leg) => leg.amount),
              nearFeeStructure,
              orderId,
            )),
            orderRecipients: nearRecipients,
            feeStructure: nearFeeStructure,
            expectedAmountOut: quotedAmountOut,
            txCompletionTime: decoded.txCompletionTime,
          };
        });

      res.status(200).json(
        await createDepositAndWithdrawOrder({
          orderId,
          chainId,
          address,
          token,
          recipients: orderRecipients,
          totalRecipientAmount: orderRecipients.reduce((sum, r) => sum + BigInt(r.amount), 0n),
          amountOut: expectedAmountOut,
          utxoAmounts,
          feeStructure,
          serializedTx,
          attribution: getRequestAttribution(res, ref),
          txCompletionTime,
          bridgeQuote: await encryptLargeField(quote),
        }),
      );
    } catch (err) {
      Logger.error('[private-send-bridge] error:', err);
      const { status, message } = resolveRouteError(err);
      res.status(status).json({ success: false, error: message });
    }
  },
);

router.get('/private-send-bridge/:orderId', verifyReadOnlySignatureMiddleware, getDepositAndWithdrawOrderStatus(true));

export default router;
