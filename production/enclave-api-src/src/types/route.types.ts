import { ERC20Token, ExternalActionId, FeeStructure } from '@hinkal/common';
import { ethers } from 'ethers';
import type { Types as TronWebTypes } from 'tronweb';

export type FailedResponse = {
  success: false;
  error: string;
};

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

export type TxHashResponse =
  | {
      success: true;
      txHash: string;
    }
  | FailedResponse;

export type WithdrawRequest = {
  address: string;
  chainId: number;
  tokenAddresses: string[];
  amounts: string[];
  recipientAddress: string;
  feeToken?: string;
  feeStructure?: FeeStructure<string>;
};

export type TransferRequest = {
  address: string;
  chainId: number;
  tokenAddresses: string[];
  amounts: string[];
  recipientAddress: string;
  feeToken?: string;
  feeStructure?: FeeStructure<string>;
};

export type SwapRequest = {
  address: string;
  chainId: number;
  tokenAddresses: string[];
  amounts: string[];
  externalActionId: ExternalActionId;
  swapData: string;
  feeToken?: string;
  feeStructure?: FeeStructure<string>;
};

export type GetSwapDataRequest = {
  address: string;
  chainId: number;
  inputTokenAddress: string;
  outputTokenAddress: string;
  amount: string;
  slippagePercentage?: number;
};

export type GetSwapDataResponse =
  | {
      success: true;
      swapData: string;
      externalActionId: ExternalActionId;
      outSwapAmount: string;
    }
  | FailedResponse;

export type GetFeeStructureRequest = {
  address: string;
  chainId: number;
  feeToken: string;
  tokenAddresses: string[];
  externalActionId: ExternalActionId;
  variableRate?: string;
  mintFrom?: string;
};

export type FeeStructureResponse =
  | {
      success: true;
      feeStructure: FeeStructure<string>;
    }
  | FailedResponse;

export type RecipientInfoRequest = {
  address: string;
  chainId: number;
};

export type RecipientInfoResponse =
  | {
      success: true;
      recipientInfo: string;
    }
  | FailedResponse;

export type SerializedTokenBalance = {
  chainId: number;
  tokenAddress: string;
  balance: string;
};

export type CreateSessionRequest = {
  signature: string;
  address: string;
  sessionId: string;
  nonce: string;
  clientPublicKey: string;
  useEIP712?: boolean;
};

export type CreateSessionResponse =
  | {
      success: true;
      expiresAt: string;
    }
  | FailedResponse;

export type BalanceRequest = {
  address: string;
  chainId: string;
};

export type BalanceResponse =
  | {
      success: true;
      balances: SerializedTokenBalance[];
    }
  | FailedResponse;

export type RefreshCacheResponse = { success: true } | FailedResponse;

export type SupportedTokensRequest = {
  chainId?: string;
};

export type SupportedTokensResponse =
  | {
      success: true;
      tokens: Record<number, ERC20Token[]>;
    }
  | FailedResponse;

export type SupportedChain = {
  chainId: number;
  name: string;
};

export type SupportedChainsResponse =
  | {
      success: true;
      chains: SupportedChain[];
    }
  | FailedResponse;

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
};

export type DepositAndWithdrawResponse =
  | {
      success: true;
      orderId: string;
      approvalAddress: string | null;
      serializedTx: string;
      amountIn: string;
      amountOut: string;
      fee: string;
    }
  | FailedResponse;
