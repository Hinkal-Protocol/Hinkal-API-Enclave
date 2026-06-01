import mongoose, { Schema } from 'mongoose';

const StampNonceSchema = new Schema({
  nonce: { type: String, required: true, unique: true },
});

export const StampNonceModel = mongoose.model('StampNonce', StampNonceSchema);
