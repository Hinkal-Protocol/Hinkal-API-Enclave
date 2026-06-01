import { createTronWeb, normalizeTronPrivateKey } from '@hinkal/common/functions/utils/tron.utils';
import { requireEnv } from '@hinkal/common/functions/utils/requireEnv';
import { TronWeb } from 'tronweb';
import { TRON_NILE_CHAIN_ID } from './tronTestConstants';

export type TronTestWallet = {
  address: string;
  privateKey: string;
  tronWeb: TronWeb;
  chainId: number;
};

export const createTronTestWallet = (privateKey: string, chainId = TRON_NILE_CHAIN_ID): TronTestWallet => {
  const normalizedKey = normalizeTronPrivateKey(privateKey);
  const tronWeb = createTronWeb(chainId, normalizedKey);
  const address = tronWeb.defaultAddress?.base58;
  if (!address) throw new Error('Failed to derive Tron address from private key');
  return { address, privateKey: normalizedKey, tronWeb, chainId };
};

export const getEnclaveTronTestWallet = (): TronTestWallet =>
  createTronTestWallet(requireEnv('ENCLAVE_TESTING_PRIVATE_KEY').trim());

export const getEnclaveTronRecipientTestWallet = (): TronTestWallet =>
  createTronTestWallet(requireEnv('ENCLAVE_TESTING_RECIPIENT_PRIVATE_KEY').trim());
