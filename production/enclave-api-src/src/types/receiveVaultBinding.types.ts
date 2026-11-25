import { ReceiveVaultNetwork, ReceiveVaultRecord } from '@hinkal/common';
import { ReceiveAddressRequest } from './route.types';

// Stored in henclave's vault record, every field encrypted on its own. creatorAddress (whose account pays out)
// and networkType come from the record's own plain fields.
export interface ReceiveVaultBinding {
  networkType: ReceiveVaultNetwork;
  creatorAddress: string;
  recipientAddress: string;
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
export type TransferAddressRequest = ReceiveAddressRequest & { recipientAddress: string };

export interface TransferTarget {
  recipientAddress: string;
  bridge?: TransferBridge;
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
