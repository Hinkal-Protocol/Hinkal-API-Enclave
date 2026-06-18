import { getAddress } from 'ethers';
import type { TypedDataDomain } from 'ethers';
import { normalizeTronAddr } from '@hinkal/common/functions/utils/tron.utils';
import { EnclaveTypedDataPayload, EnclaveTypedDataPrimaryType, TypedDataField } from '../types';
import {
  buildSortedTokenPairs,
  DepositForOtherAuthFields,
  FeeAuthFields,
  PrivateSendAuthFields,
  sortRecipientsByAddress,
  SwapAuthFields,
  TokenAmountPair,
  TokenAmountsAuthFields,
  TransferLikeAuthFields,
  WithdrawStuckUtxosAuthFields,
} from './enclaveAuthNormalization';
import type { DepositAndWithdrawRecipient } from '../types';
import { zeroAddress } from '@hinkal/common';

const ENCLAVE_TYPED_DATA_DOMAIN_NAME = 'Hinkal Enclave';

const normalizeFeeFields = (fields: FeeAuthFields) => ({
  feeToken: getAddress(fields.feeToken ?? zeroAddress),
  feeStructure: {
    feeToken: getAddress(fields.feeStructure?.feeToken ?? zeroAddress),
    flatFee: BigInt(fields.feeStructure?.flatFee ?? 0),
    variableRate: BigInt(fields.feeStructure?.variableRate ?? 0),
  },
});

const ENCLAVE_TYPED_DATA_TYPES: Record<string, TypedDataField[]> = {
  TokenAmount: [
    { name: 'token', type: 'address' },
    { name: 'amount', type: 'int256' },
  ],
  RecipientAmount: [
    { name: 'recipient', type: 'address' },
    { name: 'amount', type: 'int256' },
  ],
  FeeStructure: [
    { name: 'feeToken', type: 'address' },
    { name: 'flatFee', type: 'uint256' },
    { name: 'variableRate', type: 'uint256' },
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
    { name: 'feeToken', type: 'address' },
    { name: 'feeStructure', type: 'FeeStructure' },
  ],
  Withdraw: [
    { name: 'nonce', type: 'string' },
    { name: 'sessionId', type: 'string' },
    { name: 'chainId', type: 'uint256' },
    { name: 'tokenAmounts', type: 'TokenAmount[]' },
    { name: 'recipient', type: 'string' },
    { name: 'feeToken', type: 'address' },
    { name: 'feeStructure', type: 'FeeStructure' },
  ],
  Swap: [
    { name: 'nonce', type: 'string' },
    { name: 'sessionId', type: 'string' },
    { name: 'chainId', type: 'uint256' },
    { name: 'tokenAmounts', type: 'TokenAmount[]' },
    { name: 'externalActionId', type: 'string' },
    { name: 'swapData', type: 'string' },
    { name: 'feeToken', type: 'address' },
    { name: 'feeStructure', type: 'FeeStructure' },
  ],
  PrivateSend: [
    { name: 'nonce', type: 'string' },
    { name: 'sessionId', type: 'string' },
    { name: 'chainId', type: 'uint256' },
    { name: 'tokenAddress', type: 'address' },
    { name: 'recipients', type: 'RecipientAmount[]' },
    { name: 'feeToken', type: 'address' },
    { name: 'txCompletionTime', type: 'uint256' },
  ],
  WithdrawStuckUtxos: [
    { name: 'nonce', type: 'string' },
    { name: 'sessionId', type: 'string' },
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

  const fields = ENCLAVE_TYPED_DATA_TYPES[primaryType];

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
  types: getTypesForPrimary(primaryType),
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
  const fee = normalizeFeeFields(params);

  return buildTypedData(primaryType, params.chainId, {
    nonce: params.nonce,
    sessionId: params.sessionId,
    chainId: BigInt(params.chainId),
    tokenAmounts: toTokenAmountValues(pairs),
    recipient: params.recipientAddress,
    feeToken: fee.feeToken,
    feeStructure: fee.feeStructure,
  });
};

export const buildTransferTypedData = (params: TransferLikeAuthFields): EnclaveTypedDataPayload =>
  buildTransferLikeTypedData('Transfer', params);

export const buildWithdrawTypedData = (params: TransferLikeAuthFields): EnclaveTypedDataPayload =>
  buildTransferLikeTypedData('Withdraw', params);

export const buildSwapTypedData = (params: SwapAuthFields): EnclaveTypedDataPayload => {
  const pairs = normalizeTokenAmountPairs(params.tokenAddresses, params.amounts);
  const fee = normalizeFeeFields(params);

  return buildTypedData('Swap', params.chainId, {
    nonce: params.nonce,
    sessionId: params.sessionId,
    chainId: BigInt(params.chainId),
    tokenAmounts: toTokenAmountValues(pairs),
    externalActionId: params.externalActionId,
    swapData: params.swapData,
    feeToken: fee.feeToken,
    feeStructure: fee.feeStructure,
  });
};

export const buildDepositAndWithdrawTypedData = (params: PrivateSendAuthFields): EnclaveTypedDataPayload =>
  buildTypedData('PrivateSend', params.chainId, {
    nonce: params.nonce,
    sessionId: params.sessionId,
    chainId: BigInt(params.chainId),
    tokenAddress: getAddress(params.tokenAddress),
    recipients: normalizeDepositAndWithdrawRecipients(params.recipients),
    feeToken: getAddress(params.feeToken ?? zeroAddress),
    txCompletionTime: BigInt(params.txCompletionTime ?? 0),
  });

export const buildWithdrawStuckUtxosTypedData = (params: WithdrawStuckUtxosAuthFields): EnclaveTypedDataPayload =>
  buildTypedData('WithdrawStuckUtxos', params.chainId, {
    nonce: params.nonce,
    sessionId: params.sessionId,
    chainId: BigInt(params.chainId),
    tokenAddress: getAddress(params.tokenAddress),
    recipient: getAddress(params.recipientAddress),
  });
