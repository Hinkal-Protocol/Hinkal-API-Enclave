import { BaseAuthFields } from '../types';
import {
  buildSortedTokenPairs,
  FeeAuthFields,
  PrivateSendAuthFields,
  sortRecipientsByAddress,
  SwapAuthFields,
  TokenAmountPair,
  TransferLikeAuthFields,
} from './enclaveAuthNormalization';

const DOMAIN_NAME = 'Hinkal Enclave';

const renderTokenAmounts = (pairs: TokenAmountPair[]): string =>
  pairs.map(({ tokenAddress, amount }, i) => `  ${i}:\n    Token: ${tokenAddress}\n    Amount: ${amount}`).join('\n');

const renderRecipients = (recipients: { address: string; amount: string }[]): string =>
  recipients.map(({ address, amount }, i) => `  ${i}:\n    Recipient: ${address}\n    Amount: ${amount}`).join('\n');

const buildHeader = (primaryType: string, nonce: string, sessionId: string, chainId: number): string =>
  `${DOMAIN_NAME}\n\nPrimary Type: ${primaryType}\nSession ID: ${sessionId}\nNonce: ${nonce}\nChain ID: ${chainId}`;

const renderFeeFields = (params: FeeAuthFields): string => {
  const feeToken = params.feeToken ?? '';
  const flatFee = params.feeStructure?.flatFee ?? '0';
  const variableRate = params.feeStructure?.variableRate ?? '0';
  const feeFeeToken = params.feeStructure?.feeToken ?? '';
  return `\nFee Token: ${feeToken}\nFee Structure Fee Token: ${feeFeeToken}\nFee Flat: ${flatFee}\nFee Variable Rate: ${variableRate}`;
};

type TokenAmountsFields = BaseAuthFields & { tokenAddresses: string[]; amounts: string[] };

const buildTokenAmountsMessage = (primaryType: string, params: TokenAmountsFields): string => {
  const pairs = buildSortedTokenPairs(params.tokenAddresses, params.amounts);
  return `${buildHeader(primaryType, params.nonce, params.sessionId, params.chainId)}\nToken Amounts:\n${renderTokenAmounts(pairs)}`;
};

export const buildSolanaDepositMessage = (params: TokenAmountsFields): string =>
  buildTokenAmountsMessage('Deposit', params);

export const buildSolanaProoflessDepositMessage = (params: TokenAmountsFields): string =>
  buildTokenAmountsMessage('ProoflessDeposit', params);

export const buildSolanaDepositForOtherMessage = (params: TokenAmountsFields & { recipientInfo: string }): string =>
  `${buildTokenAmountsMessage('DepositForOther', params)}\nRecipient Info: ${params.recipientInfo}`;

const buildTransferLikeMessage = (primaryType: string, params: TransferLikeAuthFields): string =>
  `${buildTokenAmountsMessage(primaryType, params)}\nRecipient: ${params.recipientAddress}${renderFeeFields(params)}`;

export const buildSolanaWithdrawMessage = (params: TransferLikeAuthFields): string =>
  buildTransferLikeMessage('Withdraw', params);

export const buildSolanaTransferMessage = (params: TransferLikeAuthFields): string =>
  buildTransferLikeMessage('Transfer', params);

export const buildSolanaSwapMessage = (params: SwapAuthFields): string =>
  `${buildTokenAmountsMessage('Swap', params)}\nExternal Action ID: ${params.externalActionId}\nSwap Data: ${params.swapData}${renderFeeFields(params)}`;

export const buildSolanaPrivateSendMessage = (params: PrivateSendAuthFields): string => {
  const normalized = sortRecipientsByAddress(params.recipients);
  return (
    `${buildHeader('PrivateSend', params.nonce, params.sessionId, params.chainId)}` +
    `\nToken Address: ${params.tokenAddress}` +
    `\nRecipients:\n${renderRecipients(normalized)}` +
    `\nFee Token: ${params.feeToken ?? ''}` +
    `\nTx Completion Time: ${params.txCompletionTime ?? 0}`
  );
};

export const buildSolanaWithdrawStuckUtxosMessage = (
  params: BaseAuthFields & { tokenAddress: string; recipientAddress: string },
): string =>
  `${buildHeader('WithdrawStuckUtxos', params.nonce, params.sessionId, params.chainId)}` +
  `\nToken Address: ${params.tokenAddress}` +
  `\nRecipient: ${params.recipientAddress}`;
