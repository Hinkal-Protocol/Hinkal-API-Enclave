import { ReceiveVaultNetwork, ReceiveVaultRecord } from '@hinkal/common';
import type { ReferralAttribution } from './partner.types';

// Stored in henclave's vault record, every field encrypted on its own. creatorAddress (whose account pays out),
// networkType and the settle fields come from the record's own plain fields.
export interface ReceiveVaultBinding {
  networkType: ReceiveVaultNetwork;
  creatorAddress: string;
  recipientAddress: string;
  refundTo?: string; // set: whatever gets stuck in the creator's account is refunded here
  variableRate: string; // withdraw rate fixed at creation: hinkal rate + partner fee
  destinationChainId?: number; // set: each payment is bridged instead of withdrawn
  destinationTokenAddress?: string;
  slippagePercentage?: number;
  // Ref the payout is credited to (partner commission): the partner key's ref if one was used, else the body ref.
  // The vault's own `ref` is separate and credits the deposit. e.g. key "partnerX" + body ref "abc":
  // attributionRef = "partnerX", vault ref = "abc".
  attributionRef?: string;
  keyId?: string;
  partnerFeeBps?: number;
}

export type StoredReceiveVaultBinding = Omit<ReceiveVaultBinding, 'networkType' | 'creatorAddress'>;

export type EncryptedReceiveVaultBinding = { [K in keyof StoredReceiveVaultBinding]: string };

export type TransferBridge = Required<Pick<ReceiveVaultBinding, 'destinationChainId' | 'destinationTokenAddress'>> &
  Pick<ReceiveVaultBinding, 'slippagePercentage'>;

// A record as the API returns it: a transfer address's terms are decrypted.
export type ReceiveVaultAccountEntry = Omit<ReceiveVaultRecord, 'destinationChainId'> & { destinationChainId?: number };

// A receive address request that creates a transfer address: recipientAddress is set.
export interface TransferTarget {
  recipientAddress: string;
  bridge?: TransferBridge;
  acceptedChainIds: number[]; // source chains whose payments can reach the target
}

export type CreateTransferAddressParams = {
  chainId: number;
  creatorAddress: string;
  target: TransferTarget;
  variableRate: bigint;
  attribution: ReferralAttribution;
  trackedRef?: string;
  refundTo?: string;
};

// An API-key address the keeper found funds in recently, and the chains it found them on.
export interface RecentlyAttemptedVault {
  vaultAddress: string;
  network: ReceiveVaultNetwork;
  chainIds: number[];
}

export interface RefundCreator {
  refundTo: string;
  chainIds: Set<number>;
}

export enum TransferPayoutStatus {
  Processing = 'processing',
  WithdrawScheduled = 'withdraw-scheduled',
  Failed = 'failed',
}

export interface TransferPayout {
  chainId: number;
  settleTxHash: string;
  status: TransferPayoutStatus;
  scheduleId?: string;
  error?: string;
  deploymentMode?: string;
  createdAt: Date;
}
