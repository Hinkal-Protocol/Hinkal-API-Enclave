import {
  BalanceResponse,
  caseInsensitiveEqual,
  ENCLAVE_API_URL,
  EnclaveSessionAuthFields,
  httpClient,
  SerializedTokenBalance,
  sessionQueryParams,
} from '@hinkal/common';
import { requestSignatureGetHeader } from './enclaveAuthHelper';
import type { SolanaTestWallet } from './solanaTestWallet';

export const getPrivateBalance = async (
  wallet: SolanaTestWallet,
  authFields: EnclaveSessionAuthFields,
): Promise<SerializedTokenBalance[]> => {
  const params = new URLSearchParams(sessionQueryParams(authFields, wallet.chainId));
  const queryString = params.toString();
  const headers = requestSignatureGetHeader(authFields, '/balance', queryString);
  const response = await httpClient.get<BalanceResponse>(`${ENCLAVE_API_URL}/balance?${queryString}`, { headers });
  if (response.success === false) throw new Error(response.error);
  return response.balances;
};

export const getPrivateBalanceForToken = async (
  wallet: SolanaTestWallet,
  tokenAddress: string,
  authFields: EnclaveSessionAuthFields,
): Promise<bigint> => {
  const balances = await getPrivateBalance(wallet, authFields);
  return BigInt(balances.find((balance) => caseInsensitiveEqual(balance.tokenAddress, tokenAddress))?.balance ?? '0');
};
