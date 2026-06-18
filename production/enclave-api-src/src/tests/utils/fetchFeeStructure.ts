import { ethers } from 'ethers';
import { ENCLAVE_API_URL, ExternalActionId, FeeStructure, httpClient } from '@hinkal/common';
import { type EnclaveSessionAuthFields, requestSignatureGetHeader, sessionQueryParams } from './enclaveAuthHelper';
import { FeeStructureResponse } from '../../types';

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
  const headers = requestSignatureGetHeader(authFields, queryString);

  const response = await httpClient.get<FeeStructureResponse>(`${ENCLAVE_API_URL}/get-fee-structure?${queryString}`, {
    headers,
  });

  const { feeStructure } = response as Extract<FeeStructureResponse, { success: true }>;
  return feeStructure;
};
