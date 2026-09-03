import { getAddress } from 'ethers';
import type { TypedDataDomain } from 'ethers';
import { normalizeTronAddr } from '@hinkal/common/functions/utils/tron.utils';
import { EnclaveTypedDataPayload, EnclaveTypedDataPrimaryType, TypedDataField } from '../types';
import {
  buildSortedTokenPairs,
  DepositForOtherAuthFields,
  FeeAuthFields,
  PrivateSendAuthFields,
  ReceiveVaultRecoverAuthFields,
  sortRecipientsByAddress,
  SwapAuthFields,
  TokenAmountPair,
  TokenAmountsAuthFields,
  TransferLikeAuthFields,
  WithdrawStuckUtxosAuthFields,
} from './enclaveAuthNormalization';
import type { DepositAndWithdrawRecipient } from '../types';

const ENCLAVE_TYPED_DATA_DOMAIN_NAME = 'Hinkal Enclave';

const FEE_TOKEN_FIELD: TypedDataField = { name: 'feeToken', type: 'address' };
const FEE_AMOUNT_FIELD: TypedDataField = { name: 'feeAmount', type: 'uint256' };
const TX_COMPLETION_TIME_FIELD: TypedDataField = { name: 'txCompletionTime', type: 'uint256' };
const REF_FIELD: TypedDataField = { name: 'ref', type: 'string' };

const buildFeeValueFields = (fields: FeeAuthFields) => {
  const value: Record<string, unknown> = {};

  if (fields.feeToken) {
    value.feeToken = getAddress(fields.feeToken);
  }
  if (fields.feeAmount !== undefined) {
    value.feeAmount = BigInt(fields.feeAmount);
  }

  return value;
};

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
    { name: 'sessionId', type: 'string' },
    { name: 'chainId', type: 'uint256' },
    { name: 'tokenAmounts', type: 'TokenAmount[]' },
  ],
  ProoflessDeposit: [
    { name: 'nonce', type: 'string' },
    { name: 'sessionId', type: 'string' },
    { name: 'chainId', type: 'uint256' },
    { name: 'tokenAmounts', type: 'TokenAmount[]' },
  ],
  DepositForOther: [
    { name: 'nonce', type: 'string' },
    { name: 'sessionId', type: 'string' },
    { name: 'chainId', type: 'uint256' },
    { name: 'tokenAmounts', type: 'TokenAmount[]' },
    { name: 'recipientInfo', type: 'string' },
  ],
  Transfer: [
    { name: 'nonce', type: 'string' },
    { name: 'sessionId', type: 'string' },
    { name: 'chainId', type: 'uint256' },
    { name: 'tokenAmounts', type: 'TokenAmount[]' },
    { name: 'recipient', type: 'string' },
  ],
  Withdraw: [
    { name: 'nonce', type: 'string' },
    { name: 'sessionId', type: 'string' },
    { name: 'chainId', type: 'uint256' },
    { name: 'tokenAmounts', type: 'TokenAmount[]' },
    { name: 'recipient', type: 'string' },
  ],
  Swap: [
    { name: 'nonce', type: 'string' },
    { name: 'sessionId', type: 'string' },
    { name: 'chainId', type: 'uint256' },
    { name: 'tokenAmounts', type: 'TokenAmount[]' },
    { name: 'externalActionId', type: 'string' },
    { name: 'swapData', type: 'string' },
  ],
  PrivateSend: [
    { name: 'nonce', type: 'string' },
    { name: 'sessionId', type: 'string' },
    { name: 'chainId', type: 'uint256' },
    { name: 'tokenAddress', type: 'address' },
    { name: 'recipients', type: 'RecipientAmount[]' },
  ],
  WithdrawStuckUtxos: [
    { name: 'nonce', type: 'string' },
    { name: 'sessionId', type: 'string' },
    { name: 'chainId', type: 'uint256' },
    { name: 'tokenAddress', type: 'address' },
    { name: 'recipient', type: 'address' },
  ],
  ReceiveVaultRecover: [
    { name: 'nonce', type: 'string' },
    { name: 'sessionId', type: 'string' },
    { name: 'chainId', type: 'uint256' },
    { name: 'vaultAddress', type: 'string' },
    { name: 'tokenAddress', type: 'string' },
    { name: 'recipient', type: 'string' },
  ],
};

const getEnclaveTypedDataDomain = (chainId: number): TypedDataDomain => ({
  name: ENCLAVE_TYPED_DATA_DOMAIN_NAME,
  chainId,
});

const getPrimaryFields = (
  primaryType: EnclaveTypedDataPrimaryType,
  value: Record<string, unknown>,
): TypedDataField[] => {
  const fields = [...ENCLAVE_TYPED_DATA_TYPES[primaryType]];

  if (value.feeToken) fields.push(FEE_TOKEN_FIELD);
  if (value.feeAmount !== undefined) fields.push(FEE_AMOUNT_FIELD);
  if (value.txCompletionTime !== undefined) fields.push(TX_COMPLETION_TIME_FIELD);
  if (value.ref !== undefined) fields.push(REF_FIELD);

  return fields;
};

const getTypesForPrimary = (
  primaryType: EnclaveTypedDataPrimaryType,
  value: Record<string, unknown>,
): Record<string, TypedDataField[]> => {
  const fields = getPrimaryFields(primaryType, value);
  const types: Record<string, TypedDataField[]> = {
    [primaryType]: fields,
  };

  if (fields.some((f) => f.type === 'TokenAmount' || f.type === 'TokenAmount[]')) {
    types.TokenAmount = ENCLAVE_TYPED_DATA_TYPES.TokenAmount;
  }
  if (fields.some((f) => f.type === 'RecipientAmount' || f.type === 'RecipientAmount[]')) {
    types.RecipientAmount = ENCLAVE_TYPED_DATA_TYPES.RecipientAmount;
  }
  if (fields.some((f) => f.type === 'FeeStructure')) {
    types.FeeStructure = ENCLAVE_TYPED_DATA_TYPES.FeeStructure;
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
  types: getTypesForPrimary(primaryType, value),
  value,
});

const buildTokenAmountsTypedData = (
  primaryType: Extract<EnclaveTypedDataPrimaryType, 'Deposit' | 'ProoflessDeposit' | 'Swap'>,
  { nonce, sessionId, chainId, tokenAddresses, amounts }: TokenAmountsAuthFields,
): EnclaveTypedDataPayload => {
  const pairs = normalizeTokenAmountPairs(tokenAddresses, amounts);

  return buildTypedData(primaryType, chainId, {
    nonce,
    sessionId,
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
    sessionId: params.sessionId,
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
    sessionId: params.sessionId,
    chainId: BigInt(params.chainId),
    tokenAmounts: toTokenAmountValues(pairs),
    recipient: params.recipientAddress,
    ...(params.ref !== undefined ? { ref: params.ref } : {}),
    ...buildFeeValueFields(params),
  });
};

export const buildTransferTypedData = (params: TransferLikeAuthFields): EnclaveTypedDataPayload =>
  buildTransferLikeTypedData('Transfer', params);

export const buildWithdrawTypedData = (params: TransferLikeAuthFields): EnclaveTypedDataPayload =>
  buildTransferLikeTypedData('Withdraw', params);

export const buildSwapTypedData = (params: SwapAuthFields): EnclaveTypedDataPayload => {
  const pairs = normalizeTokenAmountPairs(params.tokenAddresses, params.amounts);

  return buildTypedData('Swap', params.chainId, {
    nonce: params.nonce,
    sessionId: params.sessionId,
    chainId: BigInt(params.chainId),
    tokenAmounts: toTokenAmountValues(pairs),
    externalActionId: params.externalActionId,
    swapData: params.swapData,
    ...buildFeeValueFields(params),
  });
};

export const buildDepositAndWithdrawTypedData = (params: PrivateSendAuthFields): EnclaveTypedDataPayload => {
  const value: Record<string, unknown> = {
    nonce: params.nonce,
    sessionId: params.sessionId,
    chainId: BigInt(params.chainId),
    tokenAddress: getAddress(params.tokenAddress),
    recipients: normalizeDepositAndWithdrawRecipients(params.recipients),
  };

  if (params.feeToken) {
    value.feeToken = getAddress(params.feeToken);
  }
  if (params.txCompletionTime !== undefined) {
    value.txCompletionTime = BigInt(params.txCompletionTime);
  }
  if (params.ref !== undefined) {
    value.ref = params.ref;
  }

  return buildTypedData('PrivateSend', params.chainId, value);
};

export const buildWithdrawStuckUtxosTypedData = (params: WithdrawStuckUtxosAuthFields): EnclaveTypedDataPayload =>
  buildTypedData('WithdrawStuckUtxos', params.chainId, {
    nonce: params.nonce,
    sessionId: params.sessionId,
    chainId: BigInt(params.chainId),
    tokenAddress: getAddress(params.tokenAddress),
    recipient: getAddress(params.recipientAddress),
  });

export const buildReceiveVaultRecoverTypedData = (params: ReceiveVaultRecoverAuthFields): EnclaveTypedDataPayload =>
  buildTypedData('ReceiveVaultRecover', params.chainId, {
    nonce: params.nonce,
    sessionId: params.sessionId,
    chainId: BigInt(params.chainId),
    vaultAddress: params.vaultAddress,
    tokenAddress: params.tokenAddress,
    recipient: params.recipientAddress,
  });
