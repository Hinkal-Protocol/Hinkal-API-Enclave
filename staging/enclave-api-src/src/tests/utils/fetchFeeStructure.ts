import {
  ENCLAVE_API_URL,
  EnclaveSessionAuthFields,
  ExternalActionId,
  FeeStructure,
  FeeStructureResponse,
  httpClient,
  sessionQueryParams,
} from '@hinkal/common';
import { ethers } from 'ethers';
import { requestSignatureGetHeader } from './enclaveAuthHelper';

export const fetchFeeStructure = async (
  wallet: ethers.Wallet | ethers.HDNodeWallet,
  chainId: number,
  feeToken: string,
  tokenAddresses: string[],
  externalActionId: ExternalActionId,
  authFields: EnclaveSessionAuthFields,
  variableRate?: bigint,
): Promise<FeeStructure<string>> => {
  const params = new URLSearchParams({
    ...sessionQueryParams(authFields, chainId),
    feeToken,
    externalActionId: externalActionId.toString(),
    ...(variableRate !== undefined ? { variableRate: variableRate.toString() } : {}),
  });
  tokenAddresses.forEach((addr) => params.append('tokenAddresses', addr));
  const queryString = params.toString();
  const headers = requestSignatureGetHeader(authFields, '/get-fee-structure', queryString);

  const response = await httpClient.get<FeeStructureResponse>(`${ENCLAVE_API_URL}/get-fee-structure?${queryString}`, {
    headers,
  });

  const { feeStructure } = response as Extract<FeeStructureResponse, { success: true }>;
  return feeStructure;
};
