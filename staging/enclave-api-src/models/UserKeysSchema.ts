import mongoose, { Schema } from 'mongoose';

const UserKeysSchema = new Schema({
  ethereumAddress: { type: String, required: true, unique: true, index: true },
  encryptedMnemonic: { type: String, required: true },
  encryptedSignature: { type: String, required: true },
});

export const UserKeysModel = mongoose.model('UserKeys', UserKeysSchema);
