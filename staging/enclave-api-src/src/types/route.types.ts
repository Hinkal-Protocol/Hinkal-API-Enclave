import {
  ERC20Token,
  ExternalActionId,
  FailedResponse,
  ReceiveVaultBlockReason,
  ReceiveVaultRecord,
} from '@hinkal/common';
import { ethers } from 'ethers';
import type { Types as TronWebTypes } from 'tronweb';

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
};

export type DepositForOtherRequest = {
  address: string;
  chainId: number;
  tokenAddresses: string[];
  amounts: string[];
  recipientInfo: string;
};

export type SolanaDepositForOtherRequest = {
  address: string;
  chainId: number;
  tokenAddresses: string[];
  amounts: string[];
  recipientInfo: string;
};

export type WithdrawStuckUtxosRequest = {
  address: string;
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

export type ReceiveAddressRequest = {
  chainId: number;
  tokenAddress: string;
};

export type ReceiveAddressResponse =
  | {
      success: true;
      record: ReceiveVaultRecord;
    }
  | FailedResponse;

export type ReceiveVaultEntryResponse = {
  record: ReceiveVaultRecord;
  token: ERC20Token;
  expiresAt: string;
};

export type ReceiveVaultBlockedFundResponse = {
  record: ReceiveVaultRecord;
  token: ERC20Token;
  amount: string;
  reason: ReceiveVaultBlockReason;
};

export type ReceiveVaultAccountResponse =
  | {
      success: true;
      entries: ReceiveVaultEntryResponse[];
      blockedFunds: ReceiveVaultBlockedFundResponse[];
    }
  | FailedResponse;

export type ReceiveVaultRecoverRequest = {
  chainId: number;
  vaultAddress: string;
  tokenAddress: string;
  recipientAddress: string;
};

export type ReceiveVaultRecoverResponse =
  | {
      success: true;
      txData: ethers.TransactionRequest | TronWebTypes.Transaction<TronWebTypes.TriggerSmartContract>;
    }
  | FailedResponse;
