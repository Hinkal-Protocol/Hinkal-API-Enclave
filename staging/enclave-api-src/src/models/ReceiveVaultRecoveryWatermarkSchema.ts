import mongoose, { Schema } from 'mongoose';

export interface ReceiveVaultRecoveryWatermark {
  chainId: number;
  latestBlockNumber: number;
}

const ReceiveVaultRecoveryWatermarkSchema = new Schema<ReceiveVaultRecoveryWatermark>({
  chainId: { type: Number, required: true, unique: true, index: true },
  latestBlockNumber: { type: Number, required: true },
});

export const ReceiveVaultRecoveryWatermarkModel = mongoose.model<ReceiveVaultRecoveryWatermark>(
  'ReceiveVaultRecoveryWatermark',
  ReceiveVaultRecoveryWatermarkSchema,
);
