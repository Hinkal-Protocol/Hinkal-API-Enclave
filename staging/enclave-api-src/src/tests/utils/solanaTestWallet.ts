import { Keypair } from '@solana/web3.js';
import bs58 from 'bs58';
import { requireEnv } from '@hinkal/common/functions/utils/requireEnv';
import { SOLANA_MAINNET_CHAIN_ID } from './solanaTestConstants';

export type SolanaTestWallet = {
  address: string;
  keypair: Keypair;
  chainId: number;
};

export const createSolanaTestWallet = (
  secretKeyBase58: string,
  chainId = SOLANA_MAINNET_CHAIN_ID,
): SolanaTestWallet => {
  const keypair = Keypair.fromSecretKey(bs58.decode(secretKeyBase58));
  return { address: keypair.publicKey.toBase58(), keypair, chainId };
};

export const getEnclaveSolanaTestWallet = (): SolanaTestWallet =>
  createSolanaTestWallet(requireEnv('ENCLAVE_TESTING_SOLANA_PRIVATE_KEY').trim());

export const getEnclaveSolanaRecipientTestWallet = (): SolanaTestWallet =>
  createSolanaTestWallet(requireEnv('ENCLAVE_TESTING_SOLANA_RECIPIENT_PRIVATE_KEY').trim());
