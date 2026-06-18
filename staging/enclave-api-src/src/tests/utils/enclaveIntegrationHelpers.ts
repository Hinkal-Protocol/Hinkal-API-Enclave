import { ethers } from 'ethers';
import {
  ARC_TESTNET_USDC_ADDRESS,
  ENCLAVE_API_URL,
  ERC20ABI,
  ExternalActionId,
  HINKAL_PRIVATE_SEND_VARIABLE_RATE,
  httpClient,
  waitForEthereumTransactionConfirmation,
  waitLittle,
} from '@hinkal/common';
import {
  buildAuthPost,
  buildDepositAndWithdrawAuthFields,
  buildDepositAuthFields,
  buildDepositForOtherAuthFields,
  buildProoflessDepositAuthFields,
  buildTransferAuthFields,
  buildWithdrawAuthFields,
  buildWithdrawStuckUtxosAuthFields,
  type EnclaveSessionAuthFields,
  requestSignatureGetHeader,
  requestSignaturePostHeader,
  sessionBodyParams,
  sessionQueryParams,
} from './enclaveAuthHelper';
import {
  BalanceResponse,
  DepositAndWithdrawResponse,
  DepositResponse,
  RecipientInfoResponse,
  RefreshCacheResponse,
  TxHashResponse,
} from '../../types';
import { fetchFeeStructure } from './fetchFeeStructure';

export const getRecipientInfo = async (
  wallet: ethers.Wallet,
  chainId: number,
  authFields: EnclaveSessionAuthFields,
): Promise<string> => {
  const params = new URLSearchParams(sessionQueryParams(authFields, chainId));
  const headers = requestSignatureGetHeader(authFields, params.toString());
  const response = await httpClient.get<RecipientInfoResponse>(`${ENCLAVE_API_URL}/recipient-info?${params}`, {
    headers,
  });
  if (response.success === false) throw new Error(response.error);
  return response.recipientInfo;
};

export const depositForOtherUsdc = async (
  senderWallet: ethers.Wallet,
  chainId: number,
  amount: bigint,
  recipientInfo: string,
  session: EnclaveSessionAuthFields,
  tokenAddress = ARC_TESTNET_USDC_ADDRESS,
): Promise<void> => {
  const params = { chainId, tokenAddresses: [tokenAddress], amounts: [amount.toString()], recipientInfo };
  const { body, headers } = await buildAuthPost(session, chainId, params, () =>
    buildDepositForOtherAuthFields(session, senderWallet, params),
  );

  const response = await httpClient.post<DepositResponse>(
    `${ENCLAVE_API_URL}/deposit-for-other`,
    body,
    headers ? { headers } : undefined,
  );
  const { txData } = response as Extract<DepositResponse, { success: true }>;

  const usdc = new ethers.Contract(tokenAddress, ERC20ABI, senderWallet);
  const approveTx = await usdc.approve(txData.to, amount);
  await waitForEthereumTransactionConfirmation(chainId, approveTx.hash);

  const txResponse = await senderWallet.sendTransaction(txData);
  await waitForEthereumTransactionConfirmation(chainId, txResponse.hash);
};

export const depositUsdcToPrivate = async (
  wallet: ethers.Wallet | ethers.HDNodeWallet,
  chainId: number,
  amount: bigint,
  session: EnclaveSessionAuthFields,
  tokenAddress = ARC_TESTNET_USDC_ADDRESS,
  proofless = false,
): Promise<void> => {
  const params = { chainId, tokenAddresses: [tokenAddress], amounts: [amount.toString()] };
  const builder = proofless ? buildProoflessDepositAuthFields : buildDepositAuthFields;
  const { body, headers } = await buildAuthPost(session, chainId, params, () => builder(session, wallet, params));

  const endpoint = `${ENCLAVE_API_URL}/${proofless ? 'proofless-deposit' : 'deposit'}`;
  const response = await httpClient.post<DepositResponse>(endpoint, body, headers ? { headers } : undefined);
  const { txData } = response as Extract<DepositResponse, { success: true }>;

  const usdc = new ethers.Contract(tokenAddress, ERC20ABI, wallet);
  const TX_OPTS = { evmTimeoutMs: 5 * 60 * 1000 };

  const approveTx = await usdc.approve(txData.to, amount);
  await waitForEthereumTransactionConfirmation(chainId, approveTx.hash, TX_OPTS);

  const txResponse = await wallet.sendTransaction(txData);
  await waitForEthereumTransactionConfirmation(chainId, txResponse.hash, TX_OPTS);
};

export const refreshCache = async (
  wallet: ethers.Wallet | ethers.HDNodeWallet,
  chainId: number,
  authFields: EnclaveSessionAuthFields,
): Promise<void> => {
  const body = sessionBodyParams(authFields, chainId);
  const headers = requestSignaturePostHeader(authFields, body);
  const response = await httpClient.post<RefreshCacheResponse>(`${ENCLAVE_API_URL}/refresh-cache`, body, { headers });
  if (response.success === false) throw new Error(response.error);
};

export const getStuckUtxoBalance = async (
  wallet: ethers.Wallet,
  chainId: number,
  tokenAddress: string,
  authFields: EnclaveSessionAuthFields,
): Promise<bigint> => {
  const params = new URLSearchParams(sessionQueryParams(authFields, chainId));
  const headers = requestSignatureGetHeader(authFields, params.toString());
  const response = await httpClient.get<BalanceResponse>(`${ENCLAVE_API_URL}/stuck-utxo-balance?${params}`, {
    headers,
  });
  if (response.success === false) throw new Error(response.error);
  return BigInt(
    response.balances.find((b) => b.tokenAddress.toLowerCase() === tokenAddress.toLowerCase())?.balance ?? '0',
  );
};

export const withdrawStuckUtxos = async (
  wallet: ethers.Wallet,
  chainId: number,
  tokenAddress: string,
  recipientAddress: string,
  session: EnclaveSessionAuthFields,
): Promise<string[]> => {
  const params = { chainId, tokenAddress, recipientAddress };
  const { body, headers } = await buildAuthPost(session, chainId, params, () =>
    buildWithdrawStuckUtxosAuthFields(session, wallet, params),
  );

  try {
    const response = await httpClient.post<{ success: true; txHashes: string[] }>(
      `${ENCLAVE_API_URL}/withdraw-stuck-utxos`,
      body,
      headers ? { headers } : undefined,
    );
    return response.txHashes;
  } catch (err: unknown) {
    const axiosErr = err as { response?: { data?: unknown; status?: number } };
    throw new Error(
      `POST /withdraw-stuck-utxos failed ${axiosErr.response?.status}: ${JSON.stringify(axiosErr.response?.data)}`,
    );
  }
};

const postWithRelayerRetry = async (
  url: string,
  body: Record<string, unknown>,
  headers?: Record<string, string>,
): Promise<TxHashResponse> => {
  const MAX_RETRIES = 10;
  const RETRY_DELAY_MS = 5_000;

  for (let attempt = 0; attempt < MAX_RETRIES; attempt += 1) {
    let response: TxHashResponse | undefined;
    try {
      // eslint-disable-next-line no-await-in-loop
      response = await httpClient.post<TxHashResponse>(url, body, headers ? { headers } : undefined);
    } catch (err: unknown) {
      const axiosErr = err as { response?: { data?: { error?: string }; status?: number } };
      const serverError = axiosErr.response?.data?.error ?? '';
      const isRelayerBusy =
        axiosErr.response?.status === 500 && serverError.toLowerCase().includes('relayer') && attempt < MAX_RETRIES - 1;
      if (isRelayerBusy) {
        // eslint-disable-next-line no-await-in-loop
        await waitLittle(RETRY_DELAY_MS);
      } else {
        throw new Error(`POST ${url} failed ${axiosErr.response?.status}: ${JSON.stringify(axiosErr.response?.data)}`);
      }
    }
    if (response) return response;
  }
  throw new Error(`POST ${url} failed: max retries exceeded (relayers busy)`);
};

export const withdrawUsdc = async (
  wallet: ethers.Wallet | ethers.HDNodeWallet,
  chainId: number,
  amount: bigint,
  recipientAddress: string,
  session: EnclaveSessionAuthFields,
): Promise<string> => {
  const feeStructure = await fetchFeeStructure(
    wallet,
    chainId,
    ARC_TESTNET_USDC_ADDRESS,
    [ARC_TESTNET_USDC_ADDRESS],
    ExternalActionId.Transact,
    session as EnclaveSessionAuthFields,
  );

  const txParams = {
    chainId,
    tokenAddresses: [ARC_TESTNET_USDC_ADDRESS],
    amounts: [amount.toString()],
    recipientAddress,
  };
  const { body, headers } = await buildAuthPost(
    session,
    chainId,
    { ...txParams, feeToken: ARC_TESTNET_USDC_ADDRESS, feeStructure },
    () => buildWithdrawAuthFields(session, wallet as ethers.Wallet, txParams),
  );

  const response = await postWithRelayerRetry(`${ENCLAVE_API_URL}/withdraw`, body, headers);
  const { txHash } = response as Extract<TxHashResponse, { success: true }>;
  await waitForEthereumTransactionConfirmation(chainId, txHash);
  return txHash;
};

export const transferUsdc = async (
  wallet: ethers.Wallet | ethers.HDNodeWallet,
  chainId: number,
  amount: bigint,
  recipientInfo: string,
  session: EnclaveSessionAuthFields,
): Promise<string> => {
  const feeStructure = await fetchFeeStructure(
    wallet,
    chainId,
    ARC_TESTNET_USDC_ADDRESS,
    [ARC_TESTNET_USDC_ADDRESS],
    ExternalActionId.Transact,
    session as EnclaveSessionAuthFields,
    HINKAL_PRIVATE_SEND_VARIABLE_RATE,
  );

  const txParams = {
    chainId,
    tokenAddresses: [ARC_TESTNET_USDC_ADDRESS],
    amounts: [amount.toString()],
    recipientAddress: recipientInfo,
  };
  const { body, headers } = await buildAuthPost(
    session,
    chainId,
    { ...txParams, feeToken: ARC_TESTNET_USDC_ADDRESS, feeStructure },
    () => buildTransferAuthFields(session, wallet as ethers.Wallet, txParams),
  );

  const response = await postWithRelayerRetry(`${ENCLAVE_API_URL}/transfer`, body, headers);
  const { txHash } = response as Extract<TxHashResponse, { success: true }>;
  await waitForEthereumTransactionConfirmation(chainId, txHash);
  return txHash;
};

export const prepareDepositAndWithdraw = async (
  wallet: ethers.Wallet | ethers.HDNodeWallet,
  chainId: number,
  recipients: { address: string; amount: bigint }[],
  session: EnclaveSessionAuthFields,
): Promise<Extract<DepositAndWithdrawResponse, { success: true }>> => {
  const txDataParams = {
    chainId,
    tokenAddress: ARC_TESTNET_USDC_ADDRESS,
    recipients: recipients.map((r) => ({ address: r.address, amount: r.amount.toString() })),
  };
  const { body, headers } = await buildAuthPost(session, chainId, txDataParams, () =>
    buildDepositAndWithdrawAuthFields(session, wallet, txDataParams),
  );

  const response = await httpClient.post<DepositAndWithdrawResponse>(
    `${ENCLAVE_API_URL}/private-send`,
    body,
    headers ? { headers } : undefined,
  );
  return response as Extract<DepositAndWithdrawResponse, { success: true }>;
};
