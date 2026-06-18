import { ENCLAVE_API_URL, ExternalActionId, FeeStructure, httpClient } from '@hinkal/common';
import { FeeStructureResponse } from '../../types';
import { type EnclaveSessionAuthFields, requestSignatureGetHeader, sessionQueryParams } from './enclaveAuthHelper';
import type { SolanaTestWallet } from './solanaTestWallet';

export const fetchFeeStructure = async (
  wallet: SolanaTestWallet,
  feeToken: string,
  tokenAddresses: string[],
  externalActionId: ExternalActionId,
  authFields: EnclaveSessionAuthFields,
  variableRate?: bigint,
  amounts?: bigint[],
  mintFrom?: string,
): Promise<FeeStructure<string>> => {
  const params = new URLSearchParams({
    ...sessionQueryParams(authFields, wallet.chainId),
    feeToken,
    externalActionId: externalActionId.toString(),
    ...(variableRate !== undefined ? { variableRate: variableRate.toString() } : {}),
    ...(mintFrom !== undefined ? { mintFrom } : {}),
  });
  tokenAddresses.forEach((addr) => params.append('tokenAddresses', addr));
  amounts?.forEach((amount) => params.append('amounts', amount.toString()));
  const queryString = params.toString();
  const headers = requestSignatureGetHeader(authFields, queryString);

  const response = await httpClient.get<FeeStructureResponse>(`${ENCLAVE_API_URL}/get-fee-structure?${queryString}`, {
    headers,
  });

  const { feeStructure } = response as Extract<FeeStructureResponse, { success: true }>;
  return feeStructure;
};
