import { ENCLAVE_UTXO_PRIVATE_KEY_ENCRYPTED } from '../constants';
import { cryptoHelper } from '../crypto';

let cachedKey: Promise<Buffer> | undefined;

export const getEnclaveUtxoPrivateKey = (): Promise<Buffer> => {
  if (!cachedKey) {
    if (!ENCLAVE_UTXO_PRIVATE_KEY_ENCRYPTED) {
      throw new Error('ENCLAVE_UTXO_PRIVATE_KEY_ENCRYPTED is not set');
    }
    const kmsCiphertext = Buffer.from(ENCLAVE_UTXO_PRIVATE_KEY_ENCRYPTED.replace(/^0x/, ''), 'hex');
    cachedKey = cryptoHelper.decrypt(kmsCiphertext);
  }
  return cachedKey;
};
