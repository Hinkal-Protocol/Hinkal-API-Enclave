import { ERC20Token } from '@hinkal/common/types/token.types';

export type SwapRequestBody = {
  organizationId?: string;
  userId?: string;
  fromAddress?: string;
  fromToken?: string;
  toToken?: string;
  amount?: number | string;
  chainId?: number | string;
  toChainId?: number | string;
  slippagePercentage?: number | string;
};

export type ValidatedSwapRequest = {
  parsedChainId: number;
  isCrossChain: boolean;
  inToken: ERC20Token;
  outToken: ERC20Token;
  amountWei: bigint;
  parsedSlippage: number | undefined;
};

export type SwapExecutionParams = {
  signerPublicKey: string;
  organizationId: string;
  userId: string;
  fromAddress: string;
  chainId: number;
  inToken: ERC20Token;
  outToken: ERC20Token;
  amount: string;
  amountWei: bigint;
  isNative: boolean;
  slippagePercentage?: number;
};

export type SwapExecutionResult = {
  txHash: string;
  approveTxHash?: string;
  outAmount: bigint;
  minOutAmount: bigint;
};

export type ValidatedNearBridgeRequest = {
  sourceToken: ERC20Token;
  destToken: ERC20Token;
  bridgeAmount: bigint;
  parsedSlippage: number | undefined;
  destinationRecipient: string;
};

export type NearBridgeDepositParams = ValidatedNearBridgeRequest & {
  signerPublicKey: string;
  organizationId: string;
  userId: string;
  fromAddress: string;
  sourceChainId: number;
  destChainId: number;
};

export type WalletTransferParams = {
  signerPublicKey: string;
  organizationId: string;
  userId: string;
  fromAddress: string;
  chainId: number;
  token: ERC20Token;
  amount: bigint;
  to: string;
};

export type NearBridgeDepositResult = {
  txHash: string;
  depositAddress: string;
  amountOut: string;
};

export type PrivateSwapExecutionParams = {
  organizationId: string;
  userId: string;
  signerPublicKey: string;
  fromAddress: string;
  chainId: number;
  inToken: ERC20Token;
  outToken: ERC20Token;
  amount: string;
  amountWei: bigint;
  parsedSlippage: number | undefined;
};

export type PrivateBridgeSwapResult = {
  txHash: string;
  sourceTxHash: string;
  destTxHash: string;
  destinationTokenAmount?: string;
};
