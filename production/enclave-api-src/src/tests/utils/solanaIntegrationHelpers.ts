import {
  DepositAndWithdrawResponse,
  ENCLAVE_API_URL,
  EnclaveSessionAuthFields,
  httpClient,
  networkRegistry,
  RecipientInfoResponse,
  sessionQueryParams,
  waitForTransactionConfirmation,
} from '@hinkal/common';
import { VersionedTransaction } from '@solana/web3.js';
import { createCustomSolanaConnection } from '@hinkal/common/functions/utils/create-provider';
import { getSolanaPublicBalances } from '@hinkal/common/functions/utils/publicBalance.utils';
import { SolanaDepositResponse } from '../../types';
import { SOLANA_MAINNET_USDC_ADDRESS } from './solanaTestConstants';
import { requestSignatureGetHeader } from './enclaveAuthHelper';
import {
  buildAuthPostSolana,
  buildSolanaDepositAuthFields,
  buildSolanaDepositForOtherAuthFields,
  buildSolanaPrivateSendAuthFields,
  buildSolanaProoflessDepositAuthFields,
} from './enclaveSolanaAuthHelper';
import type { SolanaTestWallet } from './solanaTestWallet';

const getSolanaConnection = (chainId: number) => {
  const { fetchRpcUrl } = networkRegistry[chainId];
  if (!fetchRpcUrl) throw new Error(`No RPC URL configured for chain ${chainId}`);
  return createCustomSolanaConnection(fetchRpcUrl);
};

const SOLANA_BALANCE_SETTLE_MS = 15_000;

const broadcastSolanaTransaction = async (wallet: SolanaTestWallet, serializedTxBase64: string): Promise<string> => {
  const connection = getSolanaConnection(wallet.chainId);
  const txBytes = Buffer.from(serializedTxBase64, 'base64');
  const tx = VersionedTransaction.deserialize(txBytes);
  tx.sign([wallet.keypair]);
  const txid = await connection.sendRawTransaction(tx.serialize());
  await waitForTransactionConfirmation(wallet.chainId, txid);
  await new Promise<void>((resolve) => {
    setTimeout(resolve, SOLANA_BALANCE_SETTLE_MS);
  });
  return txid;
};

export const getSolanaTokenBalance = async (
  wallet: SolanaTestWallet,
  tokenAddress = SOLANA_MAINNET_USDC_ADDRESS,
): Promise<bigint> => {
  const balances = await getSolanaPublicBalances(wallet.chainId, wallet.address, [
    { erc20TokenAddress: tokenAddress, chainId: wallet.chainId } as any,
  ]);
  return balances.find((b) => b.token.erc20TokenAddress === tokenAddress)?.balance ?? 0n;
};

export const getRecipientInfo = async (
  wallet: SolanaTestWallet,
  authFields: EnclaveSessionAuthFields,
): Promise<string> => {
  const params = new URLSearchParams(sessionQueryParams(authFields, wallet.chainId));
  const queryString = params.toString();
  const headers = requestSignatureGetHeader(authFields, '/recipient-info', queryString);
  const response = await httpClient.get<RecipientInfoResponse>(`${ENCLAVE_API_URL}/recipient-info?${queryString}`, {
    headers,
  });
  if (response.success === false) throw new Error(response.error);
  return response.recipientInfo;
};

export const depositUsdcToPrivate = async (
  wallet: SolanaTestWallet,
  amount: bigint,
  session: EnclaveSessionAuthFields,
  tokenAddress = SOLANA_MAINNET_USDC_ADDRESS,
  proofless = false,
): Promise<void> => {
  const params = {
    chainId: wallet.chainId,
    tokenAddresses: [tokenAddress],
    amounts: [amount.toString()],
  };
  const builder = proofless ? buildSolanaProoflessDepositAuthFields : buildSolanaDepositAuthFields;
  const routePath = `/${proofless ? 'proofless-deposit' : 'deposit'}`;
  const { body, headers } = buildAuthPostSolana(session, wallet.chainId, routePath, params, () =>
    builder(session, wallet, params),
  );

  const response = await httpClient.post<SolanaDepositResponse>(
    `${ENCLAVE_API_URL}${routePath}`,
    body,
    headers ? { headers } : undefined,
  );

  const { txData } = response as Extract<SolanaDepositResponse, { success: true }>;
  await broadcastSolanaTransaction(wallet, txData);
};

export const depositForOtherUsdc = async (
  senderWallet: SolanaTestWallet,
  amount: bigint,
  recipientInfo: string,
  session: EnclaveSessionAuthFields,
  tokenAddress = SOLANA_MAINNET_USDC_ADDRESS,
): Promise<void> => {
  const params = {
    chainId: senderWallet.chainId,
    tokenAddresses: [tokenAddress],
    amounts: [amount.toString()],
    recipientInfo,
  };
  const { body, headers } = buildAuthPostSolana(
    session,
    senderWallet.chainId,
    '/deposit-solana-for-other',
    params,
    () => buildSolanaDepositForOtherAuthFields(session, senderWallet, params),
  );

  const response = await httpClient.post<SolanaDepositResponse>(
    `${ENCLAVE_API_URL}/deposit-solana-for-other`,
    body,
    headers ? { headers } : undefined,
  );

  const { txData } = response as Extract<SolanaDepositResponse, { success: true }>;
  await broadcastSolanaTransaction(senderWallet, txData);
};

export const prepareDepositAndWithdraw = async (
  wallet: SolanaTestWallet,
  recipients: { address: string; amount: bigint }[],
  session: EnclaveSessionAuthFields,
  tokenAddress = SOLANA_MAINNET_USDC_ADDRESS,
): Promise<Extract<DepositAndWithdrawResponse, { success: true }>> => {
  const params = {
    chainId: wallet.chainId,
    tokenAddress,
    recipients: recipients.map((r) => ({ address: r.address, amount: r.amount.toString() })),
  };
  const { body, headers } = buildAuthPostSolana(session, wallet.chainId, '/private-send', params, () =>
    buildSolanaPrivateSendAuthFields(session, wallet, params),
  );

  const response = await httpClient.post<DepositAndWithdrawResponse>(
    `${ENCLAVE_API_URL}/private-send`,
    body,
    headers ? { headers } : undefined,
  );

  return response as Extract<DepositAndWithdrawResponse, { success: true }>;
};

export const broadcastPalDepositTx = async (wallet: SolanaTestWallet, serializedTxBase64: string): Promise<string> =>
  broadcastSolanaTransaction(wallet, serializedTxBase64);
