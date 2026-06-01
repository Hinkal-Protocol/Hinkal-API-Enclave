import { ENCLAVE_API_URL, ExternalActionId, FeeStructure, httpClient } from '@hinkal/common';
import { FeeStructureResponse } from '../../types';
import type { EnclaveAuthFields } from './enclaveAuthHelper';
import type { SolanaTestWallet } from './solanaTestWallet';

export const fetchFeeStructure = async (
  wallet: SolanaTestWallet,
  feeToken: string,
  tokenAddresses: string[],
  externalActionId: ExternalActionId,
  authFields: EnclaveAuthFields,
  variableRate?: bigint,
  amounts?: bigint[],
  mintFrom?: string,
): Promise<FeeStructure<string>> => {
  const params = new URLSearchParams({
    signature: authFields.signature,
    nonce: authFields.nonce,
    address: wallet.address,
    chainId: wallet.chainId.toString(),
    feeToken,
    externalActionId: externalActionId.toString(),
    ...(variableRate !== undefined ? { variableRate: variableRate.toString() } : {}),
    ...(mintFrom !== undefined ? { mintFrom } : {}),
  });
  tokenAddresses.forEach((addr) => params.append('tokenAddresses', addr));
  amounts?.forEach((amount) => params.append('amounts', amount.toString()));

  const response = await httpClient.get<FeeStructureResponse>(`${ENCLAVE_API_URL}/get-fee-structure?${params}`);

  const { feeStructure } = response as Extract<FeeStructureResponse, { success: true }>;
  return feeStructure;
};
