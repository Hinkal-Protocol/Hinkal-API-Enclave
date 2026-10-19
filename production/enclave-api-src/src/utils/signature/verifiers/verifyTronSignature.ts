import { addressToHexFormat, caseInsensitiveEqual, networkRegistry } from '@hinkal/common';
import { TronWeb } from 'tronweb';

export const verifyTronSignature = (
  signature: string,
  tronAddress: string,
  message: string,
  chainId: number,
): boolean => {
  try {
    const tronWeb = new TronWeb({ fullHost: networkRegistry[chainId].rpcUrl });
    const recovered = tronWeb.utils.message.verifyMessage(message, signature);
    return caseInsensitiveEqual(addressToHexFormat(recovered), addressToHexFormat(tronAddress));
  } catch {
    return false;
  }
};
