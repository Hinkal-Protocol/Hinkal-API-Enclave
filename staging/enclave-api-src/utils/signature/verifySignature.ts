import { isValidTronAddress, Logger } from '@hinkal/common';
import { ethers, TypedDataDomain, TypedDataField } from 'ethers';
import { verifyEthereumSignature } from './verifiers/verifyEthereumSignature';
import { verifyEthereumTypedDataSignature } from './verifiers/verifyEthereumTypedDataSignature';
import { verifySolanaSignature } from './verifiers/verifySolanaSignature';
import { verifyTronSignature } from './verifiers/verifyTronSignature';
import { verifyTronTypedDataSignature } from './verifiers/verifyTronTypedDataSignature';

export const verifySignature = async (
  signature: string,
  address: string,
  message: string,
  chainId: number,
): Promise<boolean> => {
  try {
    if (ethers.isAddress(address)) {
      return verifyEthereumSignature(signature, address, message, chainId);
    }

    if (isValidTronAddress(address)) {
      return verifyTronSignature(signature, address, message, chainId);
    }

    return verifySolanaSignature(signature, address, message);
  } catch (error) {
    Logger.error('Error verifying signature', error);
    return false;
  }
};

export const verifyTypedDataSignature = async (
  signature: string,
  address: string,
  domain: TypedDataDomain,
  types: Record<string, TypedDataField[]>,
  value: Record<string, unknown>,
  chainId: number,
): Promise<boolean> => {
  try {
    if (ethers.isAddress(address)) {
      return verifyEthereumTypedDataSignature(signature, address, domain, types, value, chainId);
    }

    if (isValidTronAddress(address)) {
      return verifyTronTypedDataSignature(signature, address, domain, types, value);
    }

    return false;
  } catch (error) {
    Logger.error('Error verifying typed data signature', error);
    return false;
  }
};
