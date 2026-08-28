import { createJsonRpcProvider } from '@hinkal/common';
import { AbiCoder, concat, getAddress, getBytes, ZeroAddress } from 'ethers';
import { VALIDATE_SIG_OFFCHAIN_BYTECODE } from './eipConstants';

export const verifyEip6492Digest = async (
  signature: string,
  expectedAddress: string,
  digest: string,
  chainId: number,
): Promise<boolean> => {
  const signer = getAddress(expectedAddress);

  if (signer === ZeroAddress) return false;

  const callData = concat([
    VALIDATE_SIG_OFFCHAIN_BYTECODE,
    AbiCoder.defaultAbiCoder().encode(['address', 'bytes32', 'bytes'], [signer, digest, signature]),
  ]);

  const provider = createJsonRpcProvider(chainId);
  const result = await provider.call({ data: callData });
  if (getBytes(result)[0] === 1) return true;
  return false;
};
