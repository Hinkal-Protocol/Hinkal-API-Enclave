import { PublicKey } from '@solana/web3.js';
import { getBytes } from 'ethers';
import nacl from 'tweetnacl';

const parseSignatureBytes = (signature: string): Uint8Array => {
  return getBytes(signature.startsWith('0x') ? signature : `0x${signature}`);
};

export const verifySolanaSignature = (signature: string, solAddress: string, message: string): boolean => {
  const signatureBytes = parseSignatureBytes(signature);
  const publicKeyBytes = new PublicKey(solAddress).toBytes();
  const messageBytes = new TextEncoder().encode(message);
  return nacl.sign.detached.verify(messageBytes, signatureBytes, publicKeyBytes);
};
