import mongoose, { Schema } from 'mongoose';

const RequestNonceSchema = new Schema({
  nonce: { type: String, required: true, unique: true },
});

const RequestNonceModel = mongoose.model('RequestNonce', RequestNonceSchema);

export const consumeRequestNonce = async (nonce: string): Promise<boolean> => {
  try {
    await RequestNonceModel.create({ nonce });
    return true;
  } catch {
    return false;
  }
};
