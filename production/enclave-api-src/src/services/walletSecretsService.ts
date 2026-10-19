import { caseInsensitiveEqual, currentTronChainId, HttpError, toBase58IfTron, WalletManager } from '@hinkal/common';
import { generateHashFromSeedPhrases } from '@hinkal/common/functions/utils/mnemonics';
import { cryptoHelper } from '../crypto';
import { WalletAddresses } from '../models/OrganizationUserSchema';
import { resolveTargetUser } from '../utils';

const findStoredWalletAddress = (wallet: WalletAddresses, walletAddress: string): string | undefined => {
  if (caseInsensitiveEqual(wallet.evmAddress, walletAddress)) return wallet.evmAddress;
  if (wallet.tronAddress && wallet.tronAddress === toBase58IfTron(currentTronChainId, walletAddress)) {
    return wallet.tronAddress;
  }
  return wallet.solanaAddress === walletAddress ? wallet.solanaAddress : undefined;
};

class WalletSecretsService {
  private findWalletIndex(wallets: WalletAddresses[], walletAddress: string): number {
    const index = wallets.findIndex((w) => findStoredWalletAddress(w, walletAddress) !== undefined);
    if (index < 0) throw new HttpError(404, 'Wallet address not found for user');
    return index;
  }

  async resolveWalletAddress(
    organizationId: string,
    userId: string,
    signerPublicKey: string,
    walletAddress: string,
  ): Promise<string> {
    const { wallets } = await resolveTargetUser(organizationId, userId, signerPublicKey);
    return (
      findStoredWalletAddress(wallets[this.findWalletIndex(wallets, walletAddress)], walletAddress) ?? walletAddress
    );
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
