import {
  ENCLAVE_API_URL,
  EnclaveSessionAuthFields,
  ExternalActionId,
  FeeResponse,
  httpClient,
  sessionQueryParams,
} from '@hinkal/common';
import { ethers } from 'ethers';
import { requestSignatureGetHeader } from './enclaveAuthHelper';

export const fetchFee = async (
  wallet: ethers.Wallet | ethers.HDNodeWallet,
  chainId: number,
  feeToken: string,
  tokenAddresses: string[],
  externalActionId: ExternalActionId,
  authFields: EnclaveSessionAuthFields,
  variableRate?: bigint,
): Promise<string> => {
  const params = new URLSearchParams({
    ...sessionQueryParams(authFields, chainId),
    feeToken,
    externalActionId: externalActionId.toString(),
    ...(variableRate !== undefined ? { variableRate: variableRate.toString() } : {}),
  });
  tokenAddresses.forEach((addr) => params.append('tokenAddresses', addr));
  const queryString = params.toString();
  const headers = requestSignatureGetHeader(authFields, '/get-fee', queryString);

  const response = await httpClient.get<FeeResponse>(`${ENCLAVE_API_URL}/get-fee?${queryString}`, {
    headers,
  });

  const { feeAmount } = response as Extract<FeeResponse, { success: true }>;
  return feeAmount;
};
