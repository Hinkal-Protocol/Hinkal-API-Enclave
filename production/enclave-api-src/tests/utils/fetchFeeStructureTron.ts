import { ENCLAVE_API_URL, ExternalActionId, FeeStructure, httpClient } from '@hinkal/common';
import type { EnclaveAuthFields } from './enclaveAuthHelper';
import { FeeStructureResponse } from '../../types';
import type { TronTestWallet } from './tronTestWallet';

export const fetchFeeStructure = async (
  wallet: TronTestWallet,
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
    chainId: wallet.chainId.toString(),
    feeToken,
    externalActionId: externalActionId.toString(),
    ...(variableRate !== undefined ? { variableRate: variableRate.toString() } : {}),
  });
  tokenAddresses.forEach((addr) => params.append('tokenAddresses', addr));

  const response = await httpClient.get<FeeStructureResponse>(`${ENCLAVE_API_URL}/get-fee-structure?${params}`);

  const { feeStructure } = response as Extract<FeeStructureResponse, { success: true }>;

  return feeStructure;
};
