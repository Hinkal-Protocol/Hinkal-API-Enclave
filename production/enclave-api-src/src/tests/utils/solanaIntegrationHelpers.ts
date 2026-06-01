import { VersionedTransaction } from '@solana/web3.js';
import { ENCLAVE_API_URL, httpClient, networkRegistry, waitForTransactionConfirmation } from '@hinkal/common';
import { createCustomSolanaConnection } from '@hinkal/common/functions/utils/create-provider';
import { getSolanaPublicBalances } from '@hinkal/common/functions/utils/publicBalance.utils';
import { DepositAndWithdrawResponse, RecipientInfoResponse, SolanaDepositResponse } from '../../types';
import {
  buildSolanaDepositAuthFields,
  buildSolanaDepositForOtherAuthFields,
  buildSolanaPrivateSendAuthFields,
  buildSolanaProoflessDepositAuthFields,
} from './enclaveSolanaAuthHelper';
import { SOLANA_MAINNET_USDC_ADDRESS } from './solanaTestConstants';
import type { EnclaveAuthFields } from './enclaveAuthHelper';
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

export const getRecipientInfo = async (wallet: SolanaTestWallet, authFields: EnclaveAuthFields): Promise<string> => {
  const params = new URLSearchParams({
    signature: authFields.signature,
    nonce: authFields.nonce,
    address: wallet.address,
    chainId: wallet.chainId.toString(),
  });
  const response = await httpClient.get<RecipientInfoResponse>(`${ENCLAVE_API_URL}/recipient-info?${params}`);
  if (response.success === false) throw new Error(response.error);
  return response.recipientInfo;
};

export const depositUsdcToPrivate = async (
  wallet: SolanaTestWallet,
  amount: bigint,
  tokenAddress = SOLANA_MAINNET_USDC_ADDRESS,
  proofless = false,
): Promise<void> => {
  const depositParams = {
    chainId: wallet.chainId,
    tokenAddresses: [tokenAddress],
    amounts: [amount.toString()],
  };
  const authFields = proofless
    ? buildSolanaProoflessDepositAuthFields(wallet, depositParams)
    : buildSolanaDepositAuthFields(wallet, depositParams);

  const response = await httpClient.post<SolanaDepositResponse>(
    `${ENCLAVE_API_URL}/${proofless ? 'proofless-deposit' : 'deposit'}`,
    { ...authFields, address: wallet.address, ...depositParams },
  );

  const { txData } = response as Extract<SolanaDepositResponse, { success: true }>;
  await broadcastSolanaTransaction(wallet, txData);
};

export const depositForOtherUsdc = async (
  senderWallet: SolanaTestWallet,
  amount: bigint,
  recipientInfo: string,
  tokenAddress = SOLANA_MAINNET_USDC_ADDRESS,
): Promise<void> => {
  const authFields = buildSolanaDepositForOtherAuthFields(senderWallet, {
    chainId: senderWallet.chainId,
    tokenAddresses: [tokenAddress],
    amounts: [amount.toString()],
    recipientInfo,
  });

  const requestBody = {
    ...authFields,
    address: senderWallet.address,
    chainId: senderWallet.chainId,
    tokenAddresses: [tokenAddress],
    amounts: [amount.toString()],
    recipientInfo,
  };
  const response = await httpClient.post<SolanaDepositResponse>(
    `${ENCLAVE_API_URL}/deposit-solana-for-other`,
    requestBody,
  );

  const { txData } = response as Extract<SolanaDepositResponse, { success: true }>;
  await broadcastSolanaTransaction(senderWallet, txData);
};

export const prepareDepositAndWithdraw = async (
  wallet: SolanaTestWallet,
  recipients: { address: string; amount: bigint }[],
  tokenAddress = SOLANA_MAINNET_USDC_ADDRESS,
): Promise<Extract<DepositAndWithdrawResponse, { success: true }>> => {
  const txDataParams = {
    chainId: wallet.chainId,
    tokenAddress,
    recipients: recipients.map((r) => ({ address: r.address, amount: r.amount.toString() })),
  };
  const authFields = buildSolanaPrivateSendAuthFields(wallet, txDataParams);

  const response = await httpClient.post<DepositAndWithdrawResponse>(`${ENCLAVE_API_URL}/private-send`, {
    ...authFields,
    address: wallet.address,
    ...txDataParams,
  });

  return response as Extract<DepositAndWithdrawResponse, { success: true }>;
};

export const broadcastPalDepositTx = async (wallet: SolanaTestWallet, serializedTxBase64: string): Promise<string> =>
  broadcastSolanaTransaction(wallet, serializedTxBase64);
