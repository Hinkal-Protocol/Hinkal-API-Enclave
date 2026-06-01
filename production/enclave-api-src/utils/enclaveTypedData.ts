import { getAddress } from 'ethers';
import type { TypedDataDomain } from 'ethers';
import { normalizeTronAddr } from '@hinkal/common/functions/utils/tron.utils';
import { EnclaveTypedDataPayload, EnclaveTypedDataPrimaryType, TypedDataField } from '../types';
import {
  buildSortedTokenPairs,
  DepositForOtherAuthFields,
  PrivateSendAuthFields,
  sortRecipientsByAddress,
  TokenAmountPair,
  TokenAmountsAuthFields,
  TransferLikeAuthFields,
  WithdrawStuckUtxosAuthFields,
} from './enclaveAuthNormalization';
import type { DepositAndWithdrawRecipient } from '../types';

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

const normalizeTokenAmountPairs = (tokenAddresses: string[], amounts: string[]): TokenAmountPair[] =>
  buildSortedTokenPairs(tokenAddresses, amounts, getAddress);

const toTokenAmountValues = (pairs: TokenAmountPair[]) =>
  pairs.map(({ tokenAddress, amount }) => ({
    token: tokenAddress,
    amount: BigInt(amount),
  }));

const normalizeRecipientAddressForTypedData = (address: string): string => {
  try {
    return getAddress(normalizeTronAddr(address));
  } catch {
    return address;
  }
};

const normalizeDepositAndWithdrawRecipients = (recipients: DepositAndWithdrawRecipient[]) =>
  sortRecipientsByAddress(recipients).map(({ address, amount }) => ({
    recipient: normalizeRecipientAddressForTypedData(address),
    amount: BigInt(amount),
  }));

const buildTypedData = (
  primaryType: EnclaveTypedDataPrimaryType,
  chainId: number,
  value: Record<string, unknown>,
): EnclaveTypedDataPayload => ({
  domain: getEnclaveTypedDataDomain(chainId),
  types: getTypesForPrimary(primaryType),
  value,
});

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

export const buildDepositForOtherTypedData = (params: DepositForOtherAuthFields): EnclaveTypedDataPayload => {
  const pairs = normalizeTokenAmountPairs(params.tokenAddresses, params.amounts);

  return buildTypedData('DepositForOther', params.chainId, {
    nonce: params.nonce,
    chainId: BigInt(params.chainId),
    tokenAmounts: toTokenAmountValues(pairs),
    recipientInfo: params.recipientInfo,
  });
};

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

export const buildDepositAndWithdrawTypedData = (params: PrivateSendAuthFields): EnclaveTypedDataPayload =>
  buildTypedData('PrivateSend', params.chainId, {
    nonce: params.nonce,
    chainId: BigInt(params.chainId),
    tokenAddress: getAddress(params.tokenAddress),
    recipients: normalizeDepositAndWithdrawRecipients(params.recipients),
  });

export const buildWithdrawStuckUtxosTypedData = (params: WithdrawStuckUtxosAuthFields): EnclaveTypedDataPayload =>
  buildTypedData('WithdrawStuckUtxos', params.chainId, {
    nonce: params.nonce,
    chainId: BigInt(params.chainId),
    tokenAddress: getAddress(params.tokenAddress),
    recipient: getAddress(params.recipientAddress),
  });
