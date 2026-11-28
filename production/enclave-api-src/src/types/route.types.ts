import {
  ERC20Token,
  ExternalActionId,
  FailedResponse,
  ReceiveVaultBlockReason,
  ReceiveVaultNetwork,
  ReceiveVaultRecord,
  SerializedTokenBalance,
} from '@hinkal/common';
import { ethers } from 'ethers';
import type { Types as TronWebTypes } from 'tronweb';
import type { ReceiveVaultAccountEntry } from './receiveVaultBinding.types';

export type DepositResponse =
  | {
      success: true;
      txData: ethers.TransactionRequest;
    }
  | FailedResponse;

export type DepositRequest = {
  address: string;
  chainId: number;
  tokenAddresses: string[];
  amounts: string[];
  ref?: string;
};

export type DepositForOtherRequest = {
  address: string;
  chainId: number;
  tokenAddresses: string[];
  amounts: string[];
  recipientInfo: string;
  ref?: string;
};

export type SolanaDepositForOtherRequest = {
  address: string;
  chainId: number;
  tokenAddresses: string[];
  amounts: string[];
  recipientInfo: string;
  ref?: string;
};

export type WithdrawStuckUtxosRequest = {
  address: string;
  chainId: number;
  tokenAddress: string;
  recipientAddress: string;
  ref?: string;
};

export type RecoverStuckBridgeBalanceRequest = {
  chainId: number;
  tokenAddress: string;
  recipientAddress: string;
};

export type SolanaDepositResponse =
  | {
      success: true;
      txData: string;
    }
  | FailedResponse;

export type WithdrawRequest = {
  address: string;
  chainId: number;
  tokenAddresses: string[];
  amounts: string[];
  recipientAddress: string;
  feeToken?: string;
  feeAmount?: string;
  ref?: string;
};

export type TransferRequest = {
  address: string;
  chainId: number;
  tokenAddresses: string[];
  amounts: string[];
  recipientAddress: string;
  feeToken?: string;
  feeAmount?: string;
  ref?: string;
};

export type SwapRequest = {
  address: string;
  chainId: number;
  tokenAddresses: string[];
  amounts: string[];
  externalActionId: ExternalActionId;
  swapData: string;
  feeToken?: string;
  feeAmount?: string;
  ref?: string;
};

export type GetSwapDataRequest = {
  address: string;
  chainId: number;
  inputTokenAddress: string;
  outputTokenAddress: string;
  amount: string;
  slippagePercentage?: number;
};

export type GetFeeRequest = {
  address: string;
  chainId: number;
  feeToken: string;
  tokenAddresses: string[];
  externalActionId: ExternalActionId;
  mintFrom?: string;
  ref?: string;
};

export type RecipientInfoRequest = {
  address: string;
  chainId: number;
};

export type CreateSessionRequest = {
  signature: string;
  address: string;
  sessionId: string;
  nonce: string;
  clientPublicKey: string;
  useEIP712?: boolean;
};

export type BalanceRequest = {
  address: string;
  chainId: string;
};

export type SupportedTokensRequest = {
  chainId?: string;
};

export type ProoflessDepositRequest = {
  address: string;
  chainId: number;
  tokenAddresses: string[];
  amounts: string[];
  ref?: string;
};

export type ProoflessDepositResponse =
  | {
      success: true;
      txData: ethers.TransactionRequest | TronWebTypes.Transaction<TronWebTypes.TriggerSmartContract> | string;
    }
  | {
      success: true;
      txHash: string;
    }
  | FailedResponse;

export type DepositAndWithdrawRequest = {
  address: string;
  chainId: number;
  tokenAddress: string;
  recipients: { address: string; amount: string }[];
  feeToken?: string;
  txCompletionTime?: number;
  ref?: string;
};

export type GetPrivateSendBridgeQuoteRequest = {
  address: string;
  chainId: number;
  destinationChainId: number;
  inputTokenAddress: string;
  outputTokenAddress: string;
  recipientAddresses: string[];
  amounts: string[];
  slippagePercentage?: number;
  txCompletionTime?: number;
};

export type PrivateSendBridgeRequest = {
  address: string;
  chainId: number;
  tokenAddress: string;
  destinationChainId: number;
  destinationTokenAddress: string;
  recipients: { address: string; amount: string }[];
  quote: string;
  ref?: string;
};

// Without recipientAddress: a plain receive address, settling into the caller's own shielded balance.
// With it: a transfer address, each payment paid out to recipientAddress (bridged when destinationChainId is set).
export type ReceiveAddressRequest = {
  chainId: number;
  ref?: string;
  forceFresh?: boolean; // skip reusing the newest unexpired plain address; a transfer address is always fresh
  recipientAddress?: string;
  destinationChainId?: number;
  destinationTokenAddress?: string;
  slippagePercentage?: number;
};

export type TransferAddressRequest = ReceiveAddressRequest & { recipientAddress: string };

export type ReceiveAddressResponse =
  | {
      success: true;
      record: ReceiveVaultRecord;
    }
  | FailedResponse;

export type PartnerTransferAddressRequest = Omit<TransferAddressRequest, 'chainId' | 'forceFresh'> & {
  networkType: ReceiveVaultNetwork;
  refundTo: string;
};

export type PartnerTransferAddressResponse =
  | {
      success: true;
      record: ReceiveVaultRecord;
      acceptedChainIds: number[];
    }
  | FailedResponse;

export type ReceiveVaultBlockedFundResponse = {
  record: ReceiveVaultAccountEntry;
  token: ERC20Token;
  amount: string;
  reason: ReceiveVaultBlockReason;
};

export type ReceiveVaultAccountResponse =
  | {
      success: true;
      entries: ReceiveVaultAccountEntry[];
      blockedFunds: ReceiveVaultBlockedFundResponse[];
    }
  | FailedResponse;

export type ReceiveVaultRecoverRequest = {
  chainId: number;
  vaultAddress: string;
  tokenAddress: string;
  recipientAddress: string;
  ref?: string;
};

export type ReceiveVaultTxData =
  | ethers.TransactionRequest
  | TronWebTypes.Transaction<TronWebTypes.TriggerSmartContract>
  | string;

export type ReceiveVaultRecoverResponse = { success: true; txData: ReceiveVaultTxData } | FailedResponse;

export enum StuckBalanceKind {
  Utxo = 'utxo',
  Bridge = 'bridge',
  Vault = 'vault',
}

export type StuckSourceDetails =
  | { kind: StuckBalanceKind.Utxo | StuckBalanceKind.Bridge }
  | { kind: StuckBalanceKind.Vault; vaultAddress: string; reason: ReceiveVaultBlockReason };

export type StuckBalanceSource = StuckSourceDetails & { amount: string };

export type StuckBalance = SerializedTokenBalance & { sources: StuckBalanceSource[] };

export type StuckBalancesResponse = { success: true; balances: StuckBalance[] } | FailedResponse;

// One creator's scan of one chain, before the creators sharing a refundTo are summed.
export type ChainStuckBalances = { chainId: number; balances: StuckBalance[]; error?: string };

export type SummedStuckBalance = {
  tokenAddress: string;
  balance: string;
  sources: { kind: StuckBalanceKind; amount: string }[];
};

// Running totals per token and kind while the creators' scans of one chain are added up.
export type ChainStuckSums = {
  error?: string;
  tokens: Map<string, { tokenAddress: string; kinds: Map<StuckBalanceKind, bigint> }>;
};

export type ChainSummedStuckBalances = { chainId: number; balances: SummedStuckBalance[]; error?: string };

export type RefundToStuckBalancesResponse = { success: true; chains: ChainSummedStuckBalances[] } | FailedResponse;

export type RecoverStuckBalanceRequest = RecoverStuckBridgeBalanceRequest & {
  kind: StuckBalanceKind;
  vaultAddress?: string;
  ref?: string;
};

export type RecoverStuckBalanceResult =
  | { txHashes: string[] }
  | { recoveredCount: number; recoveredAmount: string; failedCount: number; errors: string[] }
  | { txData: ReceiveVaultTxData };

export type RecoverStuckBalanceResponse = ({ success: true } & RecoverStuckBalanceResult) | FailedResponse;

// Signed by the refundTo wallet; nonce is a UUID used once, timestamp is in ms.
export type RefundToRecoverFields = {
  refundTo: string;
  chainId: number;
  tokenAddress: string;
  kind: StuckBalanceKind;
  nonce: string;
  timestamp: number;
};

export type RefundToRecoverRequest = RefundToRecoverFields & { signature: string };

export type RefundToRecoverResult = RecoverStuckBalanceResult | { error: string };

export type RefundToRecoverResponse = { success: true; results: RefundToRecoverResult[] } | FailedResponse;
