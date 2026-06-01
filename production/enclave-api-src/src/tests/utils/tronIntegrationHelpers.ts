import {
  addressToHexFormat,
  ENCLAVE_API_URL,
  ERC20ABI,
  evmHexToTronBase58Address,
  httpClient,
  networkRegistry,
  waitForTransactionConfirmation,
} from '@hinkal/common';
import { TRON_DEFAULT_FEE_LIMIT_SUN } from '@hinkal/common/constants/protocol.constants';
import { type EnclaveAuthFields, toEnclaveAuthQueryParams } from './enclaveAuthHelper';
import {
  buildEnclaveTronDepositAndWithdrawAuthFields,
  buildEnclaveTronDepositAuthFields,
  buildEnclaveTronDepositForOtherAuthFields,
  buildEnclaveTronProoflessDepositAuthFields,
} from './enclaveTronAuthHelper';
import { DepositAndWithdrawResponse, DepositResponse, RecipientInfoResponse } from '../../types';
import { TRON_NILE_USDT_ADDRESS } from './tronTestConstants';
import type { TronTestWallet } from './tronTestWallet';
import { Types as TronWebTypes } from 'tronweb';

const broadcastTronTransaction = async (
  wallet: TronTestWallet,
  transaction: TronWebTypes.Transaction,
): Promise<string> => {
  const signed = await wallet.tronWeb.trx.sign(transaction, wallet.privateKey);
  const result = await wallet.tronWeb.trx.sendRawTransaction(signed as TronWebTypes.SignedTransaction);
  if (!result.result) {
    const message = result.message ? Buffer.from(result.message, 'hex').toString() : 'unknown error';
    throw new Error(`Tron transaction failed: ${message}`);
  }
  const txid = result.txid ?? (result as { transaction?: { txID?: string } }).transaction?.txID;
  if (!txid) throw new Error('Tron transaction failed (missing txid)');
  return txid;
};

export const getTronUsdtBalance = async (
  wallet: TronTestWallet,
  tokenAddress = TRON_NILE_USDT_ADDRESS,
): Promise<bigint> => {
  const contract = wallet.tronWeb.contract(ERC20ABI, evmHexToTronBase58Address(tokenAddress));
  const balance = await contract['balanceOf'](wallet.address).call({ from: wallet.address });
  return BigInt(String(balance));
};

export const approveTronUsdt = async (
  wallet: TronTestWallet,
  spenderBase58: string,
  amount: bigint,
  tokenAddress = TRON_NILE_USDT_ADDRESS,
): Promise<string> => {
  const tokenBase58 = evmHexToTronBase58Address(tokenAddress);
  const { transaction } = await wallet.tronWeb.transactionBuilder.triggerSmartContract(
    tokenBase58,
    'approve(address,uint256)',
    { feeLimit: TRON_DEFAULT_FEE_LIMIT_SUN },
    [
      { type: 'address', value: spenderBase58 },
      { type: 'uint256', value: amount.toString() },
    ],
    wallet.address,
  );
  const txid = await broadcastTronTransaction(wallet, transaction);
  await waitForTransactionConfirmation(wallet.chainId, txid);
  return txid;
};

const getDepositApprovalSpender = (chainId: number, txData: unknown): string => {
  const evmTx = txData as { to?: string };
  if (evmTx?.to) {
    return evmHexToTronBase58Address(evmTx.to);
  }

  const { hinkalAddress } = networkRegistry[chainId].contractData;
  if (!hinkalAddress) throw new Error('hinkalAddress not configured for chain');
  return evmHexToTronBase58Address(hinkalAddress);
};

const asTronDepositTransaction = (txData: unknown): TronWebTypes.Transaction => {
  if (txData && typeof txData === 'object' && 'raw_data' in (txData as object)) {
    return txData as TronWebTypes.Transaction;
  }
  throw new Error('Expected Tron transaction in txData (proofless-deposit on Tron)');
};

const approveAndBroadcastDepositTx = async (
  wallet: TronTestWallet,
  txData: unknown,
  amount: bigint,
  tokenAddress = TRON_NILE_USDT_ADDRESS,
): Promise<void> => {
  const spenderBase58 = getDepositApprovalSpender(wallet.chainId, txData);
  await approveTronUsdt(wallet, spenderBase58, amount, tokenAddress);

  const depositTx = asTronDepositTransaction(txData);
  const txid = await broadcastTronTransaction(wallet, depositTx);
  await waitForTransactionConfirmation(wallet.chainId, txid);
};

export const getRecipientInfo = async (wallet: TronTestWallet, authFields: EnclaveAuthFields): Promise<string> => {
  const params = new URLSearchParams(toEnclaveAuthQueryParams(authFields, wallet.address, wallet.chainId));
  const response = await httpClient.get<RecipientInfoResponse>(`${ENCLAVE_API_URL}/recipient-info?${params}`);

  if (response.success === false) throw new Error(response.error);
  return response.recipientInfo;
};

export const depositForOtherUsdt = async (
  senderWallet: TronTestWallet,
  amount: bigint,
  recipientInfo: string,
  tokenAddress = TRON_NILE_USDT_ADDRESS,
): Promise<void> => {
  const params = {
    chainId: senderWallet.chainId,
    tokenAddresses: [tokenAddress],
    amounts: [amount.toString()],
    recipientInfo,
  };
  const authFields = await buildEnclaveTronDepositForOtherAuthFields(senderWallet, params);
  const response = await httpClient.post<DepositResponse>(`${ENCLAVE_API_URL}/deposit-for-other`, {
    ...authFields,
    address: senderWallet.address,
    ...params,
  });

  const { txData } = response as Extract<DepositResponse, { success: true }>;
  await approveAndBroadcastDepositTx(senderWallet, txData, amount, tokenAddress);
};

export const depositUsdtToPrivate = async (
  wallet: TronTestWallet,
  amount: bigint,
  tokenAddress = TRON_NILE_USDT_ADDRESS,
  proofless = false,
): Promise<void> => {
  const depositParams = {
    chainId: wallet.chainId,
    tokenAddresses: [tokenAddress],
    amounts: [amount.toString()],
  };
  const depositAuthFields = proofless
    ? await buildEnclaveTronProoflessDepositAuthFields(wallet, depositParams)
    : await buildEnclaveTronDepositAuthFields(wallet, depositParams);

  const response = await httpClient.post<DepositResponse>(
    `${ENCLAVE_API_URL}/${proofless ? 'proofless-deposit' : 'deposit'}`,
    {
      ...depositAuthFields,
      address: wallet.address,
      ...depositParams,
    },
  );

  const { txData } = response as Extract<DepositResponse, { success: true }>;
  await approveAndBroadcastDepositTx(wallet, txData, amount, tokenAddress);
};

export const prepareDepositAndWithdraw = async (
  wallet: TronTestWallet,
  recipients: { address: string; amount: bigint }[],
  tokenAddress = TRON_NILE_USDT_ADDRESS,
): Promise<Extract<DepositAndWithdrawResponse, { success: true }>> => {
  const txDataParams = {
    chainId: wallet.chainId,
    tokenAddress,
    recipients: recipients.map((r) => ({
      address: addressToHexFormat(r.address),
      amount: r.amount.toString(),
    })),
  };

  const authFields = await buildEnclaveTronDepositAndWithdrawAuthFields(wallet, txDataParams);

  const response = await httpClient.post<DepositAndWithdrawResponse>(`${ENCLAVE_API_URL}/private-send`, {
    ...authFields,
    address: wallet.address,
    ...txDataParams,
  });

  return response as Extract<DepositAndWithdrawResponse, { success: true }>;
};

export const broadcastPalDepositTx = async (wallet: TronTestWallet, serializedTxBase64: string): Promise<string> => {
  const raw = Buffer.from(serializedTxBase64, 'base64').toString('utf8');
  const transaction = JSON.parse(raw) as TronWebTypes.Transaction;
  return broadcastTronTransaction(wallet, transaction);
};
