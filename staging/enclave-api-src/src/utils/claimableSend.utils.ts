import { hashEthereumAddress } from '@hinkal/common';
import { reservePrivateSendNonceRange } from '@hinkal/common/API/privateSendNonceCalls';

export const reserveFallbackNonceRange = async (senderAddress: string, count: number): Promise<bigint> => {
  if (count <= 0) return 0n;
  const { startNonce } = await reservePrivateSendNonceRange(hashEthereumAddress(senderAddress), 0, count);
  return BigInt(startNonce);
};
