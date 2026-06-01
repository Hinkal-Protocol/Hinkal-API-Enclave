import { getAddress } from 'ethers';
import type { TypedDataDomain } from 'ethers';
import {
  BaseAuthFields,
  DepositAndWithdrawRecipient,
  EnclaveTypedDataPayload,
  EnclaveTypedDataPrimaryType,
  TokenAmountPair,
  TypedDataField,
} from '../types';

const ENCLAVE_TYPED_DATA_DOMAIN_NAME = 'Hinkal Enclave';

const ENCLAVE_TYPED_DATA_TYPES: Record<string, TypedDataField[]> = {
  TokenAmount: [
    { name: 'token', type: 'address' },
    { name: 'amount', type: 'int256' },
  ],
  RecipientAmount: [
    { name: 'recipient', type: 'address' },
    { name: 'amount', type: 'int256' },
  ],
  Deposit: [
    { name: 'nonce', type: 'string' },
    { name: 'chainId', type: 'uint256' },
    { name: 'tokenAmounts', type: 'TokenAmount[]' },
  ],
  ProoflessDeposit: [
    { name: 'nonce', type: 'string' },
    { name: 'chainId', type: 'uint256' },
    { name: 'tokenAmounts', type: 'TokenAmount[]' },
  ],
  DepositForOther: [
    { name: 'nonce', type: 'string' },
    { name: 'chainId', type: 'uint256' },
    { name: 'tokenAmounts', type: 'TokenAmount[]' },
    { name: 'recipientInfo', type: 'string' },
  ],
  Transfer: [
    { name: 'nonce', type: 'string' },
    { name: 'chainId', type: 'uint256' },
    { name: 'tokenAmounts', type: 'TokenAmount[]' },
    { name: 'recipient', type: 'string' },
  ],
  Withdraw: [
    { name: 'nonce', type: 'string' },
    { name: 'chainId', type: 'uint256' },
    { name: 'tokenAmounts', type: 'TokenAmount[]' },
    { name: 'recipient', type: 'string' },
  ],
  Swap: [
    { name: 'nonce', type: 'string' },
    { name: 'chainId', type: 'uint256' },
    { name: 'tokenAmounts', type: 'TokenAmount[]' },
  ],
  PrivateSend: [
    { name: 'nonce', type: 'string' },
    { name: 'chainId', type: 'uint256' },
    { name: 'tokenAddress', type: 'address' },
    { name: 'recipients', type: 'RecipientAmount[]' },
  ],
  WithdrawStuckUtxos: [
    { name: 'nonce', type: 'string' },
    { name: 'chainId', type: 'uint256' },
    { name: 'tokenAddress', type: 'address' },
    { name: 'recipient', type: 'address' },
  ],
};

const getEnclaveTypedDataDomain = (chainId: number): TypedDataDomain => ({
  name: ENCLAVE_TYPED_DATA_DOMAIN_NAME,
  chainId,
});

const getTypesForPrimary = (primaryType: EnclaveTypedDataPrimaryType): Record<string, TypedDataField[]> => {
  const types: Record<string, TypedDataField[]> = {
    [primaryType]: ENCLAVE_TYPED_DATA_TYPES[primaryType],
  };

  const usesTokenAmount = ENCLAVE_TYPED_DATA_TYPES[primaryType].some(
    (field) => field.type === 'TokenAmount' || field.type === 'TokenAmount[]',
  );
  if (usesTokenAmount) {
    types.TokenAmount = ENCLAVE_TYPED_DATA_TYPES.TokenAmount;
  }

  const usesRecipientAmount = ENCLAVE_TYPED_DATA_TYPES[primaryType].some(
    (field) => field.type === 'RecipientAmount' || field.type === 'RecipientAmount[]',
  );
  if (usesRecipientAmount) {
    types.RecipientAmount = ENCLAVE_TYPED_DATA_TYPES.RecipientAmount;
  }

  return types;
};

const normalizeTokenAmountPairs = (tokenAddresses: string[], amounts: string[]): TokenAmountPair[] => {
  if (tokenAddresses.length !== amounts.length) {
    throw new Error('tokenAddresses and amounts must have the same length');
  }

  return tokenAddresses
    .map((tokenAddress, index) => ({
      tokenAddress: getAddress(tokenAddress),
      amount: amounts[index],
    }))
    .sort((a, b) => a.tokenAddress.localeCompare(b.tokenAddress));
};

const toTokenAmountValues = (pairs: TokenAmountPair[]) =>
  pairs.map(({ tokenAddress, amount }) => ({
    token: tokenAddress,
    amount: BigInt(amount),
  }));

const normalizeRecipientAddressForTypedData = (address: string): string => {
  try {
    return getAddress(address);
  } catch {
    return address;
  }
};

const normalizeDepositAndWithdrawRecipients = (recipients: DepositAndWithdrawRecipient[]) =>
  recipients
    .map(({ address, amount }) => ({
      recipient: normalizeRecipientAddressForTypedData(address),
      amount: BigInt(amount),
    }))
    .sort((a, b) => a.recipient.localeCompare(b.recipient));

const buildTypedData = (
  primaryType: EnclaveTypedDataPrimaryType,
  chainId: number,
  value: Record<string, unknown>,
): EnclaveTypedDataPayload => ({
  domain: getEnclaveTypedDataDomain(chainId),
  types: getTypesForPrimary(primaryType),
  value,
});

type TokenAmountsAuthFields = BaseAuthFields & { tokenAddresses: string[]; amounts: string[] };

const buildTokenAmountsTypedData = (
  primaryType: Extract<EnclaveTypedDataPrimaryType, 'Deposit' | 'ProoflessDeposit' | 'Swap'>,
  { nonce, chainId, tokenAddresses, amounts }: TokenAmountsAuthFields,
): EnclaveTypedDataPayload => {
  const pairs = normalizeTokenAmountPairs(tokenAddresses, amounts);

  return buildTypedData(primaryType, chainId, {
    nonce,
    chainId: BigInt(chainId),
    tokenAmounts: toTokenAmountValues(pairs),
  });
};

export const buildDepositTypedData = (params: TokenAmountsAuthFields): EnclaveTypedDataPayload =>
  buildTokenAmountsTypedData('Deposit', params);

export const buildProoflessDepositTypedData = (params: TokenAmountsAuthFields): EnclaveTypedDataPayload =>
  buildTokenAmountsTypedData('ProoflessDeposit', params);

export const buildDepositForOtherTypedData = (
  params: TokenAmountsAuthFields & { recipientInfo: string },
): EnclaveTypedDataPayload => {
  const pairs = normalizeTokenAmountPairs(params.tokenAddresses, params.amounts);

  return buildTypedData('DepositForOther', params.chainId, {
    nonce: params.nonce,
    chainId: BigInt(params.chainId),
    tokenAmounts: toTokenAmountValues(pairs),
    recipientInfo: params.recipientInfo,
  });
};

type TransferLikeAuthFields = TokenAmountsAuthFields & { recipientAddress: string };

const buildTransferLikeTypedData = (
  primaryType: Extract<EnclaveTypedDataPrimaryType, 'Transfer' | 'Withdraw'>,
  params: TransferLikeAuthFields,
): EnclaveTypedDataPayload => {
  const pairs = normalizeTokenAmountPairs(params.tokenAddresses, params.amounts);

  return buildTypedData(primaryType, params.chainId, {
    nonce: params.nonce,
    chainId: BigInt(params.chainId),
    tokenAmounts: toTokenAmountValues(pairs),
    recipient: params.recipientAddress,
  });
};

export const buildTransferTypedData = (params: TransferLikeAuthFields): EnclaveTypedDataPayload =>
  buildTransferLikeTypedData('Transfer', params);

export const buildWithdrawTypedData = (params: TransferLikeAuthFields): EnclaveTypedDataPayload =>
  buildTransferLikeTypedData('Withdraw', params);

export const buildSwapTypedData = (params: TokenAmountsAuthFields): EnclaveTypedDataPayload =>
  buildTokenAmountsTypedData('Swap', params);

export const buildDepositAndWithdrawTypedData = (
  params: BaseAuthFields & {
    tokenAddress: string;
    recipients: DepositAndWithdrawRecipient[];
  },
): EnclaveTypedDataPayload =>
  buildTypedData('PrivateSend', params.chainId, {
    nonce: params.nonce,
    chainId: BigInt(params.chainId),
    tokenAddress: getAddress(params.tokenAddress),
    recipients: normalizeDepositAndWithdrawRecipients(params.recipients),
  });

export const buildWithdrawStuckUtxosTypedData = (
  params: BaseAuthFields & { tokenAddress: string; recipientAddress: string },
): EnclaveTypedDataPayload =>
  buildTypedData('WithdrawStuckUtxos', params.chainId, {
    nonce: params.nonce,
    chainId: BigInt(params.chainId),
    tokenAddress: getAddress(params.tokenAddress),
    recipient: getAddress(params.recipientAddress),
  });
