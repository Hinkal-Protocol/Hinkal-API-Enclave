import {
  ENCLAVE_API_URL,
  EnclaveSessionAuthFields,
  ExternalActionId,
  FeeResponse,
  httpClient,
  sessionQueryParams,
} from '@hinkal/common';
import { requestSignatureGetHeader } from './enclaveAuthHelper';
import type { SolanaTestWallet } from './solanaTestWallet';

export const fetchFee = async (
  wallet: SolanaTestWallet,
  feeToken: string,
  tokenAddresses: string[],
  externalActionId: ExternalActionId,
  authFields: EnclaveSessionAuthFields,
  variableRate?: bigint,
  amounts?: bigint[],
  mintFrom?: string,
): Promise<string> => {
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
  const headers = requestSignatureGetHeader(authFields, '/get-fee', queryString);

  const response = await httpClient.get<FeeResponse>(`${ENCLAVE_API_URL}/get-fee?${queryString}`, {
    headers,
  });

  const { feeAmount } = response as Extract<FeeResponse, { success: true }>;
  return feeAmount;
};
