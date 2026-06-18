import { ethers } from 'ethers';
import { caseInsensitiveEqual, ENCLAVE_API_URL, httpClient } from '@hinkal/common';
import { BalanceResponse, SerializedTokenBalance } from '../../types';
import { type EnclaveSessionAuthFields, requestSignatureGetHeader, sessionQueryParams } from './enclaveAuthHelper';

export const getPrivateBalance = async (
  wallet: ethers.Wallet | ethers.HDNodeWallet,
  chainId: number,
  authFields: EnclaveSessionAuthFields,
): Promise<SerializedTokenBalance[]> => {
  const params = new URLSearchParams(sessionQueryParams(authFields, chainId));
  const queryString = params.toString();
  const headers = requestSignatureGetHeader(authFields, queryString);

  const response = await httpClient.get<BalanceResponse>(`${ENCLAVE_API_URL}/balance?${queryString}`, { headers });

  if (response.success === false) throw new Error(response.error);

  return response.balances;
};

export const getPrivateBalanceForToken = async (
  wallet: ethers.Wallet | ethers.HDNodeWallet,
  chainId: number,
  tokenAddress: string,
  authFields: EnclaveSessionAuthFields,
): Promise<bigint> => {
  const balances = await getPrivateBalance(wallet, chainId, authFields);
  return BigInt(balances.find((balance) => caseInsensitiveEqual(balance.tokenAddress, tokenAddress))?.balance ?? '0');
};
