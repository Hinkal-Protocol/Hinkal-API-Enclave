import { ethers } from 'ethers';
import { ENCLAVE_API_URL, httpClient } from '@hinkal/common';
import type { EnclaveAuthFields } from './enclaveAuthHelper';
import { GetSwapDataResponse } from '../../types';

export const fetchSwapData = async (
  wallet: ethers.Wallet,
  chainId: number,
  inputTokenAddress: string,
  outputTokenAddress: string,
  amount: string,
  authFields: EnclaveAuthFields,
  slippagePercentage?: number,
): Promise<Extract<GetSwapDataResponse, { success: true }>> => {
  const params = new URLSearchParams({
    signature: authFields.signature,
    nonce: authFields.nonce,
    address: wallet.address,
    chainId: chainId.toString(),
    inputTokenAddress,
    outputTokenAddress,
    amount,
    ...(slippagePercentage !== undefined ? { slippagePercentage: slippagePercentage.toString() } : {}),
  });

  const response = await httpClient.get<GetSwapDataResponse>(`${ENCLAVE_API_URL}/get-swap-data?${params}`);

  if (response.success === false) throw new Error(response.error);

  return response;
};
