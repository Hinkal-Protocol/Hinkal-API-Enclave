import {
  ENCLAVE_API_URL,
  EnclaveSessionAuthFields,
  ExternalActionId,
  FeeStructure,
  FeeStructureResponse,
  httpClient,
  sessionQueryParams,
} from '@hinkal/common';
import { requestSignatureGetHeader } from './enclaveAuthHelper';
import type { TronTestWallet } from './tronTestWallet';

export const fetchFeeStructure = async (
  wallet: TronTestWallet,
  feeToken: string,
  tokenAddresses: string[],
  externalActionId: ExternalActionId,
  authFields: EnclaveSessionAuthFields,
  variableRate?: bigint,
): Promise<FeeStructure<string>> => {
  const params = new URLSearchParams({
    ...sessionQueryParams(authFields, wallet.chainId),
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
