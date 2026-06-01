import { hashMessage, verifyMessage } from 'ethers';
import { verifyEip6492Digest } from '../eip6492';
import { verifyEip1271Digest } from '../eip1271';
import { caseInsensitiveEqual } from '@hinkal/common';

export const verifyEthereumSignature = async (
  signature: string,
  expectedAddress: string,
  message: string,
  chainId: number,
): Promise<boolean> => {
  try {
    const recovered = verifyMessage(message, signature);
    if (caseInsensitiveEqual(recovered, expectedAddress)) return true;
  } catch {
    // try smart-wallet paths
  }

  try {
    if (await verifyEip1271Digest(signature, expectedAddress, hashMessage(message), chainId)) return true;
  } catch {
    // try smart-wallet paths
  }

  return verifyEip6492Digest(signature, expectedAddress, hashMessage(message), chainId);
};
