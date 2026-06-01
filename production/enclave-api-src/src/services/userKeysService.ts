import { generateHashFromSeedPhrases, WalletManager } from '@hinkal/common';
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
}

export const userKeysService = new UserKeysService();
