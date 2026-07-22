import {
  ENCLAVE_API_URL,
  EnclaveSessionAuthFields,
  GetSwapDataResponse,
  httpClient,
  sessionQueryParams,
} from '@hinkal/common';
import { ethers } from 'ethers';
import { requestSignatureGetHeader } from './enclaveAuthHelper';

export const fetchSwapData = async (
  wallet: ethers.Wallet,
  chainId: number,
  inputTokenAddress: string,
  outputTokenAddress: string,
  amount: string,
  authFields: EnclaveSessionAuthFields,
  slippagePercentage?: number,
): Promise<Extract<GetSwapDataResponse, { success: true }>> => {
  const params = new URLSearchParams({
    ...sessionQueryParams(authFields, chainId),
    inputTokenAddress,
    outputTokenAddress,
    amount,
    ...(slippagePercentage !== undefined ? { slippagePercentage: slippagePercentage.toString() } : {}),
  });
  const queryString = params.toString();
  const headers = requestSignatureGetHeader(authFields, '/get-swap-data', queryString);

  const response = await httpClient.get<GetSwapDataResponse>(`${ENCLAVE_API_URL}/get-swap-data?${queryString}`, {
    headers,
  });

  if (response.success === false) throw new Error(response.error);
  return response;
};
