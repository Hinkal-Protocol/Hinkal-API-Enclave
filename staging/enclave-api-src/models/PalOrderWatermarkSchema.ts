import mongoose, { Schema } from 'mongoose';

export interface PalOrderWatermark {
  chainId: number;
  latestBlockNumber: number;
}

const PalOrderWatermarkSchema = new Schema<PalOrderWatermark>({
  chainId: { type: Number, required: true, unique: true, index: true },
  latestBlockNumber: { type: Number, required: true },
});

export const PalOrderWatermarkModel = mongoose.model<PalOrderWatermark>('PalOrderWatermark', PalOrderWatermarkSchema);
