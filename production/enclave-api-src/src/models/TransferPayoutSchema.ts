import mongoose, { Schema } from 'mongoose';
import { TransferPayout, TransferPayoutStatus } from '../types';

const TransferPayoutSchema = new Schema<TransferPayout>(
  {
    chainId: { type: Number, required: true },
    settleTxHash: { type: String, required: true },
    status: { type: String, enum: Object.values(TransferPayoutStatus), required: true },
    scheduleId: { type: String },
    error: { type: String },
    deploymentMode: { type: String },
  },
  { timestamps: { createdAt: true, updatedAt: false } },
);

// Unique: inserting the row claims the payout, so a settle is never withdrawn twice.
TransferPayoutSchema.index({ chainId: 1, settleTxHash: 1 }, { unique: true });

export const TransferPayoutModel = mongoose.model<TransferPayout>('TransferPayout', TransferPayoutSchema);
