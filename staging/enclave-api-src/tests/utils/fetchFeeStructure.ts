import { ethers } from 'ethers';
import { ENCLAVE_API_URL, ExternalActionId, FeeStructure, httpClient } from '@hinkal/common';
import type { EnclaveAuthFields } from './enclaveAuthHelper';
import { FeeStructureResponse } from '../../types';

export const fetchFeeStructure = async (
  wallet: ethers.Wallet | ethers.HDNodeWallet,
  chainId: number,
  feeToken: string,
  tokenAddresses: string[],
  externalActionId: ExternalActionId,
  authFields: EnclaveAuthFields,
  variableRate?: bigint,
): Promise<FeeStructure<string>> => {
  const params = new URLSearchParams({
    signature: authFields.signature,
    nonce: authFields.nonce,
    address: wallet.address,
    chainId: chainId.toString(),
    feeToken,
    externalActionId: externalActionId.toString(),
    ...(variableRate !== undefined ? { variableRate: variableRate.toString() } : {}),
  });
  tokenAddresses.forEach((addr) => params.append('tokenAddresses', addr));

  const response = await httpClient.get<FeeStructureResponse>(`${ENCLAVE_API_URL}/get-fee-structure?${params}`);

  const { feeStructure } = response as Extract<FeeStructureResponse, { success: true }>;

  return feeStructure;
};
