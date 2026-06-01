import { networkRegistry } from '@hinkal/common';
import { TronWeb } from 'tronweb';

export const verifyTronSignature = (
  signature: string,
  tronAddress: string,
  message: string,
  chainId: number,
): boolean => {
  try {
    const tronWeb = new TronWeb({ fullHost: networkRegistry[chainId].fetchRpcUrl });
    const recovered = tronWeb.utils.message.verifyMessage(message, signature);
    return recovered === tronAddress;
  } catch {
    return false;
  }
};
