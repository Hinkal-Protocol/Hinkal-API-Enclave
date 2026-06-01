import mongoose, { Schema } from 'mongoose';

export interface PalApiKey {
  apiKey: string;
  name?: string;
  createdAt: Date;
}

const PalApiKeySchema = new Schema<PalApiKey>(
  {
    apiKey: { type: String, required: true, unique: true, index: true },
    name: { type: String },
  },
  { timestamps: true },
);

export const PalApiKeyModel = mongoose.model<PalApiKey>('PalApiKey', PalApiKeySchema);
