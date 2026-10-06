import mongoose, { Schema } from 'mongoose';
import { EnclaveHmac, EnclaveHmacSchema } from './EnclaveHmacSchema';

export interface RecipientInfoEntry {
  privateAddress: string;
  isAvailable: boolean;
}

export interface RecipientInfoPool {
  hashedEthereumAddress: string;
  recipientInfos: RecipientInfoEntry[];
  enclaveHmac: EnclaveHmac;
}

const RecipientInfoEntrySchema = new Schema<RecipientInfoEntry>(
  {
    privateAddress: { type: String, required: true },
    isAvailable: { type: Boolean, required: true },
  },
  { _id: false },
);

const RecipientInfoPoolSchema = new Schema<RecipientInfoPool>(
  {
    hashedEthereumAddress: { type: String, required: true },
    recipientInfos: { type: [RecipientInfoEntrySchema], required: true, default: [] },
    enclaveHmac: { type: EnclaveHmacSchema, required: true },
  },
  { collection: 'privatesendrecipientinfopoolsv2', versionKey: false, autoIndex: false },
);

export const RecipientInfoPoolModel = mongoose.model<RecipientInfoPool>('RecipientInfoPool', RecipientInfoPoolSchema);
