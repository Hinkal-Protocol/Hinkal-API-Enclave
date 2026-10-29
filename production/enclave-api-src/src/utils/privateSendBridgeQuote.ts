import {
  AccountActions,
  API_ERROR_MESSAGES,
  buildTempSubAccountForChain,
  caseInsensitiveEqual,
  CustomJSONParse,
  CustomJSONStringify,
  DepositAndBridgeQuote,
  HttpError,
  IHinkal,
  THROWN_ERROR_MESSAGES,
  toBase58IfTron,
} from '@hinkal/common';
import { DepositAndWithdrawRecipient, PrivateSendBridgeQuotePayload } from '../types';

export const serializePrivateSendBridgeQuote = (
  address: string,
  quote: DepositAndBridgeQuote,
  txCompletionTime?: number,
): string => {
  const payload: PrivateSendBridgeQuotePayload = {
    address,
    issuedAt: Date.now(),
    txCompletionTime,
    quote: {
      ...quote,
      lifiRecipients: quote.lifiRecipients?.map((recipient) => ({
        ...recipient,
        temporarySubAccount: { ...recipient.temporarySubAccount, privateKey: '' },
      })),
    },
  };
  return CustomJSONStringify(payload);
};

export const parsePrivateSendBridgeQuote = (
  hinkal: IHinkal,
  serializedQuote: string,
  address: string,
  chainId: number,
  tokenAddress: string,
): PrivateSendBridgeQuotePayload => {
  let payload: PrivateSendBridgeQuotePayload;
  try {
    payload = CustomJSONParse(serializedQuote) as PrivateSendBridgeQuotePayload;
  } catch {
    throw new HttpError(400, API_ERROR_MESSAGES.INVALID_QUOTE);
  }

  const { quote } = payload;
  if (
    !caseInsensitiveEqual(payload.address, address) ||
    quote.sourceChainId !== chainId ||
    !caseInsensitiveEqual(quote.sourceTokenAddress, tokenAddress)
  ) {
    throw new HttpError(400, API_ERROR_MESSAGES.QUOTE_MISMATCH);
  }
  if (quote.lifiRecipients?.length && quote.nearLegs?.length) {
    throw new HttpError(400, API_ERROR_MESSAGES.QUOTE_BOTH_ROUTES);
  }

  const lifiRecipients = quote.lifiRecipients?.map((recipient) => {
    const sourceSubAccount = buildTempSubAccountForChain(hinkal, chainId, BigInt(recipient.temporarySubAccount.index));
    const ethAddress = AccountActions.getAddressFromSubAccount(chainId, sourceSubAccount);
    if (!sourceSubAccount.privateKey || !caseInsensitiveEqual(ethAddress, recipient.temporarySubAccount.ethAddress)) {
      throw new Error(THROWN_ERROR_MESSAGES.FAILED_TO_DERIVE_SOURCE_TEMP_WALLET);
    }
    return {
      ...recipient,
      temporarySubAccount: { ...recipient.temporarySubAccount, privateKey: sourceSubAccount.privateKey },
    };
  });

  return { ...payload, quote: { ...quote, lifiRecipients } };
};

export const assertQuoteMatchesRequest = (
  quote: DepositAndBridgeQuote,
  destinationChainId: number,
  destinationTokenAddress: string,
  recipients: DepositAndWithdrawRecipient[],
): void => {
  const quotedRecipients =
    quote.nearLegs?.map((leg) => ({ address: leg.destinationRecipient, amount: leg.amount.toString() })) ??
    quote.lifiRecipients?.map((recipient) => ({
      address: recipient.recipientAddress,
      amount: recipient.bridgeAmount.toString(),
    })) ??
    [];
  const toSortedKeys = (items: DepositAndWithdrawRecipient[]) =>
    items.map(({ address, amount }) => `${address.toLowerCase()}:${BigInt(amount)}`).sort();
  const signed = toSortedKeys(
    recipients.map(({ address, amount }) => ({ address: toBase58IfTron(destinationChainId, address), amount })),
  );
  const quoted = toSortedKeys(quotedRecipients);

  const matches =
    quote.destinationChainId === destinationChainId &&
    caseInsensitiveEqual(quote.destinationTokenAddress, destinationTokenAddress) &&
    signed.length === quoted.length &&
    signed.every((key, i) => key === quoted[i]);

  if (!matches) throw new HttpError(400, API_ERROR_MESSAGES.QUOTE_DESTINATION_MISMATCH);
};
