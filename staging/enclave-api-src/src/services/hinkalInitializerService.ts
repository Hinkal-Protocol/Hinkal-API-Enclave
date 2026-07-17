import {
  createJsonRpcProvider,
  Hinkal,
  IProviderAdapter,
  isSolanaLike,
  isTronLike,
  networkRegistry,
} from '@hinkal/common';
import { userKeysService } from './userKeysService';
import { buildVoidProviderAdapter } from '../utils/initVoidProviderAdapter';
import { liveChainStateService } from '@hinkal/backend-common';
import { TronProviderAdapter } from '@hinkal/common/providers/TronProviderAdapter';
import { SolanaProviderAdapter } from '@hinkal/common/providers/SolanaProviderAdapter';
import { EthersProviderAdapter } from '@hinkal/common/providers/EthersProviderAdapter';
import { ethers } from 'ethers';
import { SolanaLocalSigner, TronLocalSigner } from '../data-structures';
import { walletSecretsService } from './walletSecretsService';

class HinkalInitializerService {
  async withHinkalForAddress<T>(
    ethereumAddress: string,
    chainId: number,
    callback: (hinkal: Hinkal<unknown>) => Promise<T>,
  ): Promise<T> {
    const hinkal = await this.initalizeHinkalForAddress(ethereumAddress, chainId);
    try {
      return await callback(hinkal);
    } finally {
      await hinkal.destroy();
    }
  }

  async withHinkalForOrganization<T>(
    organizationId: string,
    userId: string,
    signerPublicKey: string,
    fromAddress: string,
    chainId: number,
    callback: (hinkal: Hinkal<unknown>) => Promise<T>,
    skipMerkleTreeInit = false,
  ): Promise<T> {
    const hinkal = await this.initHinkalForOrganization(
      organizationId,
      userId,
      signerPublicKey,
      fromAddress,
      chainId,
      skipMerkleTreeInit,
    );
    try {
      return await callback(hinkal);
    } finally {
      await hinkal.destroy();
    }
  }

  private finalizeHinkalInit = async (
    hinkal: Hinkal<unknown>,
    wallet: unknown,
    providerAdapter: IProviderAdapter<unknown>,
    chainId: number,
    loginSignature: string,
    skipMerkleTreeInit = false,
  ): Promise<void> => {
    await hinkal.initProviderAdapter(wallet, providerAdapter);
    hinkal.initUserKeysWithSignature(loginSignature);
    await hinkal.switchNetwork(networkRegistry[chainId]);
    if (!skipMerkleTreeInit) {
      await liveChainStateService.prepareHinkal(chainId, hinkal);
    }
  };

  private async initalizeHinkalForAddress(ethereumAddress: string, chainId: number) {
    const userKey = await userKeysService.findOrCreatePrivateKey(ethereumAddress);
    const hinkal = new Hinkal<unknown>({ useFileCache: true, allowParallelBalanceLocalDecryption: true });
    const { wallet, providerAdapter } = buildVoidProviderAdapter(chainId, ethereumAddress);
    await this.finalizeHinkalInit(hinkal, wallet, providerAdapter, chainId, userKey);
    return hinkal;
  }

  private async initHinkalForOrganization(
    organizationId: string,
    userId: string,
    signerPublicKey: string,
    fromAddress: string,
    chainId: number,
    skipMerkleTreeInit = false,
  ): Promise<Hinkal<unknown>> {
    const hinkal = new Hinkal({ useFileCache: true, allowParallelBalanceLocalDecryption: true });

    const { seedHash, childWallet } = await walletSecretsService.getSeedHashAndChildWallet(
      organizationId,
      userId,
      signerPublicKey,
      fromAddress,
    );
    const seedHashHex = seedHash.startsWith('0x') ? seedHash : `0x${seedHash}`;

    if (isTronLike(chainId)) {
      const tronWallet = {
        address: fromAddress,
        signerAdapter: new TronLocalSigner(childWallet.tron.privateKey, chainId),
      };
      const tronAdapter = new TronProviderAdapter(chainId);
      tronAdapter.initConnector(tronWallet);
      await this.finalizeHinkalInit(hinkal, tronWallet, tronAdapter, chainId, seedHashHex, skipMerkleTreeInit);
      return hinkal;
    }

    if (isSolanaLike(chainId)) {
      const solanaWallet = new SolanaLocalSigner(childWallet.solana.secretKey, childWallet.solana.publicKey);
      await this.finalizeHinkalInit(
        hinkal,
        solanaWallet,
        new SolanaProviderAdapter(chainId),
        chainId,
        seedHashHex,
        skipMerkleTreeInit,
      );
      return hinkal;
    }

    const provider = createJsonRpcProvider(chainId);
    const signer = new ethers.Wallet(childWallet.ethereum.privateKey, provider);
    const providerAdapter = new EthersProviderAdapter();
    providerAdapter.initSigner?.(signer);

    await this.finalizeHinkalInit(hinkal, undefined, providerAdapter, chainId, seedHashHex, skipMerkleTreeInit);
    return hinkal;
  }
}

export const hinkalInitializerService = new HinkalInitializerService();
