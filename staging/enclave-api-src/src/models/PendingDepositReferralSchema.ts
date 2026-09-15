import mongoose, { Schema } from 'mongoose';
import { AdminTransactionType } from '@hinkal/common';

export interface PendingDepositConfirmation {
  orderId: string;
  chainId: number;
  action: AdminTransactionType;
  ethereumAddress: string;
  tokenAddresses: string[];
  amounts: string[];
  ref?: string;
  enclaveHmac?: object;
}

const PendingDepositConfirmationSchema = new Schema<PendingDepositConfirmation>({
  orderId: { type: String, required: true, unique: true, index: true },
  chainId: { type: Number, required: true },
  action: { type: String, required: true },
  ethereumAddress: { type: String, required: true },
  tokenAddresses: { type: [String], required: true },
  amounts: { type: [String], required: true },
  ref: { type: String },
  enclaveHmac: { type: Object },
});

export const PendingDepositConfirmationModel = mongoose.model<PendingDepositConfirmation>(
  'PendingDepositConfirmation',
  PendingDepositConfirmationSchema,
);
