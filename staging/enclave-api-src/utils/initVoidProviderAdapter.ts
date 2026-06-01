import { PublicKey } from '@solana/web3.js';
import { ethers } from 'ethers';
import EthersProviderAdapterFactory from '@hinkal/common/providers/EthersProviderAdapter';
import { SolanaProviderAdapter } from '@hinkal/common/providers/SolanaProviderAdapter';
import { TronProviderAdapter } from '@hinkal/common/providers/TronProviderAdapter';
import { isSolanaLike, isTronLike } from '@hinkal/common/constants/chains.constants';
import { createJsonRpcProvider } from '@hinkal/common/functions/utils/create-provider';
import { SolanaWallet, TronWallet } from '@hinkal/common/types';

const voidThrow = () => {
  throw new Error('VoidSigner: signing not supported in enclave provider');
};

const createVoidSolanaWallet = (ethereumAddress: string): SolanaWallet => ({
  publicKey: new PublicKey(ethereumAddress),
  signTransaction: voidThrow as any,
  signAllTransactions: voidThrow as any,
  signMessage: voidThrow as any,
});

const createVoidTronWallet = (address: string): TronWallet => ({
  address,
  signerAdapter: {
    signMessage: voidThrow as any,
    signTransaction: voidThrow as any,
    on: () => ({}) as any,
    off: () => ({}) as any,
  },
});

export const buildVoidProviderAdapter = (chainId: number, address: string) => {
  if (isTronLike(chainId)) {
    const tronWallet = createVoidTronWallet(address);
    const tronAdapter = new TronProviderAdapter(chainId);
    tronAdapter.initConnector(tronWallet);
    return { wallet: tronWallet, providerAdapter: tronAdapter };
  }

  if (isSolanaLike(chainId)) {
    const solanaWallet = createVoidSolanaWallet(address);
    const solanaAdapter = new SolanaProviderAdapter(chainId, address);
    return { wallet: solanaWallet, providerAdapter: solanaAdapter };
  }

  const provider = createJsonRpcProvider(chainId);
  const voidSigner = new ethers.VoidSigner(address, provider);
  const evmAdapter = EthersProviderAdapterFactory();
  evmAdapter.initSigner?.(voidSigner);
  return { wallet: undefined, providerAdapter: evmAdapter };
};
