import { Schema } from 'mongoose';

export interface EnclaveHmac {
  algorithm: string;
  signature: string;
}

export const EnclaveHmacSchema = new Schema<EnclaveHmac>(
  {
    algorithm: { type: String, required: true },
    signature: { type: String, required: true },
  },
  { _id: false },
);
