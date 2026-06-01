import { caseInsensitiveEqual, HttpError, WalletManager } from '@hinkal/common';
import { generateHashFromSeedPhrases } from '@hinkal/common/functions/utils/mnemonics';
import { cryptoHelper } from '../crypto';
import { WalletAddresses } from '../models/OrganizationUserSchema';
import { resolveTargetUser } from '../utils';

class WalletSecretsService {
  private findWalletIndex(wallets: WalletAddresses[], walletAddress: string): number {
    const index = wallets.findIndex(
      (w) =>
        caseInsensitiveEqual(w.evmAddress, walletAddress) ||
        w.tronAddress === walletAddress ||
        w.solanaAddress === walletAddress,
    );
    if (index < 0) throw new HttpError(404, 'Wallet address not found for user');
    return index;
  }

  async getSeedHashAndChildWallet(
    organizationId: string,
    userId: string,
    signerPublicKey: string,
    walletAddress: string,
  ) {
    const target = await resolveTargetUser(organizationId, userId, signerPublicKey);
    const { encryptedMnemonic } = target;
    const mnemonic = (await cryptoHelper.decrypt(Buffer.from(encryptedMnemonic, 'base64'))).toString('utf8');

    const seedHash = generateHashFromSeedPhrases(mnemonic.split(' '));

    const walletManager = new WalletManager();
    walletManager.createMainWallet(mnemonic);

    const walletIndex = this.findWalletIndex(target.wallets, walletAddress);
    const childWallet = await walletManager.createChildWallet(walletIndex);
    return { seedHash, childWallet };
  }
}

export const walletSecretsService = new WalletSecretsService();
