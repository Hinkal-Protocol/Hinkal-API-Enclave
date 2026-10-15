import { ERC20Token, FeeStructure } from '@hinkal/common';
import { DepositAndWithdrawRecipient } from './enclaveTypedData.types';
import { ReferralAttribution } from './partner.types';

export type DecodedDeposit = {
  erc20Addresses: string[];
  amounts: string[];
};

export type DecodedOrder = {
  orderId: string;
  deposit: DecodedDeposit | null;
};

export type CreateDepositAndWithdrawOrderParams = {
  orderId: string;
  chainId: number;
  address: string;
  token: ERC20Token;
  recipients: DepositAndWithdrawRecipient[];
  totalRecipientAmount: bigint;
  amountOut?: bigint; // reported as amountOut instead of totalRecipientAmount (bridge: expected destination amount)
  utxoAmounts: bigint[];
  feeStructure: FeeStructure;
  serializedTx: string;
  attribution: ReferralAttribution;
  txCompletionTime?: number;
  bridgeQuote?: string;
};
