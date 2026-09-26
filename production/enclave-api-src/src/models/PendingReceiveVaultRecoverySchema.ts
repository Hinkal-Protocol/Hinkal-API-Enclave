import mongoose, { Schema } from 'mongoose';

export const PENDING_RECEIVE_VAULT_RECOVERY_TTL_SECONDS = 7 * 24 * 60 * 60;

export interface PendingReceiveVaultRecovery {
  chainId: number;
  vaultAddress: string;
  tokenAddress: string;
  recipientAddress: string;
  expectedAmount: string;
  createdAtBlock: number;
  createdAt: Date;
  ref?: string;
  deploymentMode?: string;
  enclaveHmac?: object;
}

const PendingReceiveVaultRecoverySchema = new Schema<PendingReceiveVaultRecovery>({
  chainId: { type: Number, required: true },
  vaultAddress: { type: String, required: true },
  tokenAddress: { type: String, required: true },
  recipientAddress: { type: String, required: true },
  expectedAmount: { type: String, required: true },
  createdAtBlock: { type: Number, required: true },
  createdAt: { type: Date, required: true, expires: PENDING_RECEIVE_VAULT_RECOVERY_TTL_SECONDS },
  ref: { type: String },
  deploymentMode: { type: String },
  enclaveHmac: { type: Object },
});

PendingReceiveVaultRecoverySchema.index({ chainId: 1, vaultAddress: 1, tokenAddress: 1 }, { unique: true });

export const PendingReceiveVaultRecoveryModel = mongoose.model<PendingReceiveVaultRecovery>(
  'PendingReceiveVaultRecovery',
  PendingReceiveVaultRecoverySchema,
);
