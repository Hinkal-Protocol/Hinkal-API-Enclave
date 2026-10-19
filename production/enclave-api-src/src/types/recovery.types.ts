import { ReceiveVaultBlockReason } from '@hinkal/common/types/receive-vault.types';
import { TemporaryWalletRecoveryDestination } from '@hinkal/common/types/token.types';

export interface TemporaryWalletRecoveryRequestParams {
  organizationId: string;
  userId: string;
  signerPublicKey: string;
  fromAddress: string;
  chainIds: number[];
}

export interface RecoveredTemporaryWalletFund {
  chainId: number;
  nonce: number;
  tempWalletAddress: string;
  tokenAddress: string;
  tokenSymbol: string;
  amount: string;
  txHash: string;
  recoveredTo: TemporaryWalletRecoveryDestination;
}

export interface FailedTemporaryWalletRecovery {
  chainId: number;
  nonce: number;
  tempWalletAddress: string;
  tokenAddress: string;
  error: string;
}

export interface SkippedTemporaryWalletNonce {
  chainId: number;
  nonce: number;
  tempWalletAddress: string;
  reason: string;
}

export interface TemporaryWalletRecoveryResult {
  recovered: RecoveredTemporaryWalletFund[];
  failed: FailedTemporaryWalletRecovery[];
  skipped: SkippedTemporaryWalletNonce[];
}

export interface ReceiveVaultFundsRequestParams {
  organizationId: string;
  userId: string;
  signerPublicKey: string;
  fromAddress: string;
  chainId: number;
}

export interface ReceiveVaultFund {
  chainId: number;
  vaultAddress: string;
  tokenAddress: string;
  tokenSymbol: string;
  amount: string;
  reason: ReceiveVaultBlockReason;
}

export interface RecoveredReceiveVaultFund extends ReceiveVaultFund {
  txHash: string;
}

export interface FailedReceiveVaultRecovery extends ReceiveVaultFund {
  error: string;
}

export interface ReceiveVaultRecoveryResult {
  recovered: RecoveredReceiveVaultFund[];
  failed: FailedReceiveVaultRecovery[];
}
