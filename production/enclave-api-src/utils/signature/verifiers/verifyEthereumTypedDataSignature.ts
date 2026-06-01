import { caseInsensitiveEqual } from '@hinkal/common';
import { TypedDataDomain, TypedDataEncoder, TypedDataField, verifyTypedData } from 'ethers';
import { verifyEip6492Digest } from '../eip6492';
import { verifyEip1271Digest } from '../eip1271';

export const verifyEthereumTypedDataSignature = async (
  signature: string,
  expectedAddress: string,
  domain: TypedDataDomain,
  types: Record<string, TypedDataField[]>,
  value: Record<string, unknown>,
  chainId: number,
): Promise<boolean> => {
  try {
    const recovered = verifyTypedData(domain, types, value, signature);
    if (caseInsensitiveEqual(recovered, expectedAddress)) return true;
  } catch {
    // try smart-wallet paths
  }

  const digest = TypedDataEncoder.hash(domain, types, value);

  try {
    if (await verifyEip1271Digest(signature, expectedAddress, digest, chainId)) return true;
  } catch {
    // try smart-wallet paths
  }

  return verifyEip6492Digest(signature, expectedAddress, digest, chainId);
};
