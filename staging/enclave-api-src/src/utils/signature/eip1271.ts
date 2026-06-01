import { createJsonRpcProvider, EIP1271_SUCCESS } from '@hinkal/common';
import { Contract, getAddress, toUtf8Bytes } from 'ethers';

const EIP1271_ABI = [
  'function isValidSignature(bytes32 _hash, bytes _signature) external view returns (bytes4)',
  'function isValidSignature(bytes _message, bytes _signature) external view returns (bytes4)',
] as const;

export const verifyEip1271Digest = async (
  signature: string,
  expectedAddress: string,
  digest: string,
  chainId: number,
): Promise<boolean> => {
  const provider = createJsonRpcProvider(chainId);
  const contract = new Contract(getAddress(expectedAddress), EIP1271_ABI, provider);

  try {
    const bytes32Result = await contract.isValidSignature(digest, signature);
    if (bytes32Result === EIP1271_SUCCESS) return true;
  } catch {
    // try bytes overload
  }

  try {
    const bytesResult = await contract.isValidSignature(toUtf8Bytes(digest), signature);
    if (bytesResult === EIP1271_SUCCESS) return true;
  } catch {
    return false;
  }

  return false;
};
