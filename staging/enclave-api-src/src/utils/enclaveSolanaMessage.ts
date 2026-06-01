import { BaseAuthFields, DepositAndWithdrawRecipient } from '../types';
import { buildSortedTokenPairs, sortRecipientsByAddress, TokenAmountPair } from './enclaveAuthNormalization';

const DOMAIN_NAME = 'Hinkal Enclave';

const renderTokenAmounts = (pairs: TokenAmountPair[]): string =>
  pairs.map(({ tokenAddress, amount }, i) => `  ${i}:\n    Token: ${tokenAddress}\n    Amount: ${amount}`).join('\n');

const renderRecipients = (recipients: { address: string; amount: string }[]): string =>
  recipients.map(({ address, amount }, i) => `  ${i}:\n    Recipient: ${address}\n    Amount: ${amount}`).join('\n');

const buildHeader = (primaryType: string, nonce: string, chainId: number): string =>
  `${DOMAIN_NAME}\n\nPrimary Type: ${primaryType}\nNonce: ${nonce}\nChain ID: ${chainId}`;

type TokenAmountsFields = BaseAuthFields & { tokenAddresses: string[]; amounts: string[] };

const buildTokenAmountsMessage = (primaryType: string, params: TokenAmountsFields): string => {
  const pairs = buildSortedTokenPairs(params.tokenAddresses, params.amounts);
  return `${buildHeader(primaryType, params.nonce, params.chainId)}\nToken Amounts:\n${renderTokenAmounts(pairs)}`;
};

export const buildSolanaDepositMessage = (params: TokenAmountsFields): string =>
  buildTokenAmountsMessage('Deposit', params);

export const buildSolanaProoflessDepositMessage = (params: TokenAmountsFields): string =>
  buildTokenAmountsMessage('ProoflessDeposit', params);

export const buildSolanaDepositForOtherMessage = (params: TokenAmountsFields & { recipientInfo: string }): string =>
  `${buildTokenAmountsMessage('DepositForOther', params)}\nRecipient Info: ${params.recipientInfo}`;

type TransferLikeFields = TokenAmountsFields & { recipientAddress: string };

const buildTransferLikeMessage = (primaryType: string, params: TransferLikeFields): string =>
  `${buildTokenAmountsMessage(primaryType, params)}\nRecipient: ${params.recipientAddress}`;

export const buildSolanaWithdrawMessage = (params: TransferLikeFields): string =>
  buildTransferLikeMessage('Withdraw', params);

export const buildSolanaTransferMessage = (params: TransferLikeFields): string =>
  buildTransferLikeMessage('Transfer', params);

export const buildSolanaSwapMessage = (params: TokenAmountsFields): string => buildTokenAmountsMessage('Swap', params);

export const buildSolanaPrivateSendMessage = (
  params: BaseAuthFields & {
    tokenAddress: string;
    recipients: DepositAndWithdrawRecipient[];
  },
): string => {
  const normalized = sortRecipientsByAddress(params.recipients);
  return (
    `${buildHeader('PrivateSend', params.nonce, params.chainId)}` +
    `\nToken Address: ${params.tokenAddress}` +
    `\nRecipients:\n${renderRecipients(normalized)}`
  );
};

export const buildSolanaWithdrawStuckUtxosMessage = (
  params: BaseAuthFields & { tokenAddress: string; recipientAddress: string },
): string =>
  `${buildHeader('WithdrawStuckUtxos', params.nonce, params.chainId)}` +
  `\nToken Address: ${params.tokenAddress}` +
  `\nRecipient: ${params.recipientAddress}`;
