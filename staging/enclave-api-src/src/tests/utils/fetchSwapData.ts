import { ethers } from 'ethers';
import { ENCLAVE_API_URL, httpClient } from '@hinkal/common';
import { type EnclaveSessionAuthFields, requestSignatureGetHeader, sessionQueryParams } from './enclaveAuthHelper';
import { GetSwapDataResponse } from '../../types';

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
  const headers = requestSignatureGetHeader(authFields, queryString);

  const response = await httpClient.get<GetSwapDataResponse>(`${ENCLAVE_API_URL}/get-swap-data?${queryString}`, {
    headers,
  });

  if (response.success === false) throw new Error(response.error);
  return response;
};
