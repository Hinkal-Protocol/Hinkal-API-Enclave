import { generateHashFromSeedPhrases, WalletManager } from '@hinkal/common';
import { MONGO_DUPLICATE_KEY_ERROR } from '../constants';
import { UserKeysModel } from '../models/UserKeysSchema';
import { cryptoHelper } from '../crypto';

class UserKeysService {
  public async findByEthereumAddress(ethereumAddress: string) {
    const record = await UserKeysModel.findOne({ ethereumAddress });
    if (!record) return null;
    const decrypted = await cryptoHelper.decrypt(Buffer.from(record.encryptedSignature, 'base64'));
    return decrypted.toString('utf8');
  }

  public async createAndStorePrivateKey(ethereumAddress: string) {
    const mnemonic = new WalletManager().generateMnemonic();
    const mnemonicPhrase = mnemonic.join(' ');
    const signature = generateHashFromSeedPhrases(mnemonic);
    const [encryptedMnemonic, encryptedSignature] = await Promise.all([
      cryptoHelper.encrypt(Buffer.from(mnemonicPhrase, 'utf8')),
      cryptoHelper.encrypt(Buffer.from(signature, 'utf8')),
    ]);

    await UserKeysModel.create({
      ethereumAddress,
      encryptedMnemonic: encryptedMnemonic.toString('base64'),
      encryptedSignature: encryptedSignature.toString('base64'),
    });

    return signature;
  }

  public async findOrCreatePrivateKey(ethereumAddress: string) {
    const existing = await this.findByEthereumAddress(ethereumAddress);
    if (existing) return existing;

    try {
      return await this.createAndStorePrivateKey(ethereumAddress);
    } catch (err: unknown) {
      if ((err as { code?: number })?.code !== MONGO_DUPLICATE_KEY_ERROR) throw err;

      // It is possible that other request created the key after we checked for it, so we need to check again before throwing the error.
      const createdByOtherRequest = await this.findByEthereumAddress(ethereumAddress);
      if (!createdByOtherRequest) throw err;
      return createdByOtherRequest;
    }
  }
}

export const userKeysService = new UserKeysService();
