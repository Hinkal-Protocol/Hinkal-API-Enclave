import { DepositAndBridgeQuote } from '@hinkal/common';

export type PrivateSendBridgeQuotePayload = {
  address: string;
  issuedAt: number;
  txCompletionTime?: number;
  quote: DepositAndBridgeQuote;
};
