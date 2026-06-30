import { BaseAuthFields, DepositAndWithdrawRecipient } from '../types';

export type TokenAmountPair = { tokenAddress: string; amount: string };

export type SerializedFeeStructure = { feeToken: string; flatFee: string; variableRate: string };

export type FeeAuthFields = {
  feeToken?: string;
  feeStructure?: SerializedFeeStructure;
};

export type TokenAmountsAuthFields = BaseAuthFields & { tokenAddresses: string[]; amounts: string[] };
export type TransferLikeAuthFields = TokenAmountsAuthFields & { recipientAddress: string } & FeeAuthFields;
export type SwapAuthFields = TokenAmountsAuthFields & { externalActionId: string; swapData: string } & FeeAuthFields;
export type DepositForOtherAuthFields = TokenAmountsAuthFields & { recipientInfo: string };
export type PrivateSendAuthFields = BaseAuthFields & {
  tokenAddress: string;
  recipients: DepositAndWithdrawRecipient[];
  feeToken?: string;
  txCompletionTime?: number;
  ref?: string;
};
export type WithdrawStuckUtxosAuthFields = BaseAuthFields & { tokenAddress: string; recipientAddress: string };

export const buildSortedTokenPairs = (
  tokenAddresses: string[],
  amounts: string[],
  normalizeAddress: (addr: string) => string = (addr) => addr,
): TokenAmountPair[] => {
  if (tokenAddresses.length !== amounts.length) {
    throw new Error('tokenAddresses and amounts must have the same length');
  }
  return tokenAddresses
    .map((tokenAddress, index) => ({
      tokenAddress: normalizeAddress(tokenAddress),
      amount: amounts[index],
    }))
    .sort((a, b) => a.tokenAddress.localeCompare(b.tokenAddress));
};

export const sortRecipientsByAddress = (recipients: DepositAndWithdrawRecipient[]): DepositAndWithdrawRecipient[] =>
  [...recipients].sort((a, b) => a.address.localeCompare(b.address));
