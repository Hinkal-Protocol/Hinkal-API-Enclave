import mongoose, { Schema } from 'mongoose';
import { EnclaveHmac, EnclaveHmacSchema } from './EnclaveHmacSchema';

interface UserKeys {
  ethereumAddress: string;
  encryptedMnemonic: string;
  encryptedSignature: string;
  enclaveHmac: EnclaveHmac;
}

const UserKeysSchema = new Schema<UserKeys>(
  {
    ethereumAddress: { type: String, required: true, unique: true, index: true },
    encryptedMnemonic: { type: String, required: true },
    encryptedSignature: { type: String, required: true },
    enclaveHmac: { type: EnclaveHmacSchema, required: true },
  },
  { collection: 'userkeysv2' },
);

export const UserKeysModel = mongoose.model('UserKeys', UserKeysSchema);
