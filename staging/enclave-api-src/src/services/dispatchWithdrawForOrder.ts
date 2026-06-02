import { Connection } from '@solana/web3.js';
import {
  AdminTransactionType,
  FeeStructure,
  fetchSolanaTransaction,
  formatMintAddress,
  getERC20Token,
  getOnChainUtxosFromReceipt,
  getOnChainUtxosFromReceiptSolana,
  hashEthereumAddress,
  hinkalSolanaWithdrawBatch,
  hinkalWithdrawBatch,
  IHinkal,
  networkRegistry,
  RecipientUtxo,
  waitForDepositedUtxosInMerkleTree,
  waitForEthereumTransactionConfirmation,
} from '@hinkal/common';

export interface DepositAndWithdrawOrderBase {
  orderId: string;
  chainId: number;
  senderAddress: string;
  recipients: { address: string; amount: string }[];
  tokenAddress: string;
  feeToken: string;
  flatFee: string;
  variableRate: string;
  utxoAmounts: string[];
  txCompletionTime?: number;
  txHash: string;
}

export const dispatchEvmWithdrawForOrder = async (
  hinkal: IHinkal,
  order: DepositAndWithdrawOrderBase,
): Promise<string> => {
  const token = getERC20Token(order.tokenAddress, order.chainId);
  if (!token) throw new Error(`Token ${order.tokenAddress} not found for chain ${order.chainId}`);

  const receipt = await waitForEthereumTransactionConfirmation(order.chainId, order.txHash);
  const depositedUtxos = getOnChainUtxosFromReceipt(receipt, hinkal, order.chainId, token.erc20TokenAddress);
  if (depositedUtxos.length === 0) throw new Error(`No on-chain UTXOs found in tx ${order.txHash}`);

  const utxoAmounts = order.utxoAmounts.map((s) => BigInt(s));
  const availableUtxos = [...depositedUtxos];
  const userDepositedUtxos: RecipientUtxo[] = utxoAmounts.map((amount, i) => {
    const matchIndex = availableUtxos.findIndex((u) => u.amount === amount);
    if (matchIndex === -1) throw new Error(`No UTXO found matching amount ${amount} for recipient ${i}`);
    const [match] = availableUtxos.splice(matchIndex, 1);
    return { recipientAddress: order.recipients[i].address, utxo: match };
  });

  const recipientAmounts = order.recipients.map((r) => BigInt(r.amount));
  const feeStructure: FeeStructure = {
    feeToken: order.feeToken,
    flatFee: BigInt(order.flatFee),
    variableRate: BigInt(order.variableRate),
  };

  await waitForDepositedUtxosInMerkleTree(hinkal, order.chainId, userDepositedUtxos);

  return hinkalWithdrawBatch(
    hinkal,
    order.chainId,
    token,
    userDepositedUtxos,
    recipientAmounts,
    feeStructure,
    hashEthereumAddress(order.senderAddress),
    undefined,
    order.txCompletionTime,
    undefined,
    AdminTransactionType.PayPublicToPublicSend,
  );
};

export const dispatchSolanaWithdrawForOrder = async (
  hinkal: IHinkal,
  order: DepositAndWithdrawOrderBase,
): Promise<string> => {
  const token = getERC20Token(order.tokenAddress, order.chainId);
  if (!token) throw new Error(`Token ${order.tokenAddress} not found for chain ${order.chainId}`);

  const { fetchRpcUrl } = networkRegistry[order.chainId];
  const { hinkalIdl } = networkRegistry[order.chainId].contractData;
  if (!fetchRpcUrl) throw new Error(`Missing fetchRpcUrl for chain ${order.chainId}`);
  if (!hinkalIdl) throw new Error(`Missing Hinkal IDL for chain ${order.chainId}`);

  const connection = new Connection(fetchRpcUrl, 'confirmed');
  const tx = await fetchSolanaTransaction(connection, order.txHash, 'confirmed');
  if (!tx) throw new Error(`Receipt not found for signature ${order.txHash}`);

  const program = hinkal.getSolanaProgram(hinkalIdl);
  const { compressedAddress } = formatMintAddress(token.erc20TokenAddress);
  const depositedUtxos = getOnChainUtxosFromReceiptSolana(tx, program, hinkal.userKeys, compressedAddress);
  if (depositedUtxos.length === 0) throw new Error(`No on-chain UTXOs found in tx ${order.txHash}`);

  const utxoAmounts = order.utxoAmounts.map((s) => BigInt(s));
  const availableUtxos = [...depositedUtxos];
  const userDepositedUtxos: RecipientUtxo[] = utxoAmounts.map((amount, i) => {
    const matchIndex = availableUtxos.findIndex((u) => u.amount === amount);
    if (matchIndex === -1) throw new Error(`No UTXO found matching amount ${amount} for recipient ${i}`);
    const [match] = availableUtxos.splice(matchIndex, 1);
    return { recipientAddress: order.recipients[i].address, utxo: match };
  });

  const recipientAmounts = order.recipients.map((r) => BigInt(r.amount));
  const feeStructure: FeeStructure = {
    feeToken: order.feeToken,
    flatFee: BigInt(order.flatFee),
    variableRate: BigInt(order.variableRate),
  };

  await waitForDepositedUtxosInMerkleTree(hinkal, order.chainId, userDepositedUtxos);

  return hinkalSolanaWithdrawBatch(
    hinkal,
    order.chainId,
    token,
    userDepositedUtxos,
    feeStructure,
    hashEthereumAddress(order.senderAddress),
    recipientAmounts,
    undefined,
    order.txCompletionTime,
    undefined,
    AdminTransactionType.PayPublicToPublicSend,
  );
};
