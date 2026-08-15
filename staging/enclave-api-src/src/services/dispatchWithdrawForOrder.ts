import { Connection } from '@solana/web3.js';
import {
  ERC20Token,
  FeeStructure,
  fetchSolanaTransaction,
  formatMintAddress,
  getOnChainUtxosFromReceipt,
  getOnChainUtxosFromReceiptSolana,
  getUtxosFromReceipt,
  hashEthereumAddress,
  hinkalSolanaWithdrawBatch,
  hinkalWithdrawBatch,
  IHinkal,
  networkRegistry,
  RecipientUtxo,
  Utxo,
  waitForDepositedUtxosInMerkleTree,
  waitForEthereumTransactionConfirmation,
} from '@hinkal/common';
import { getERC20Token } from '@hinkal/erc20-registry';

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
  ref?: string;
  txHash: string;
}

const resolveOrderToken = (order: DepositAndWithdrawOrderBase): ERC20Token => {
  const token = getERC20Token(order.tokenAddress, order.chainId);
  if (!token) throw new Error(`Token ${order.tokenAddress} not found for chain ${order.chainId}`);
  return token;
};

const buildOrderFeeStructure = (order: DepositAndWithdrawOrderBase): FeeStructure => ({
  feeToken: order.feeToken,
  flatFee: BigInt(order.flatFee),
  variableRate: BigInt(order.variableRate),
});

const matchDepositedUtxos = (order: DepositAndWithdrawOrderBase, depositedUtxos: Utxo[]): RecipientUtxo[] => {
  if (depositedUtxos.length === 0) throw new Error(`No deposited UTXOs found in tx ${order.txHash}`);

  const utxoAmounts = order.utxoAmounts.map((s) => BigInt(s));
  const availableUtxos = [...depositedUtxos];
  return utxoAmounts.map((amount, i) => {
    const matchIndex = availableUtxos.findIndex((u) => u.amount === amount);
    if (matchIndex === -1) throw new Error(`No UTXO found matching amount ${amount} for recipient ${i}`);
    const [match] = availableUtxos.splice(matchIndex, 1);
    return { recipientAddress: order.recipients[i].address, utxo: match };
  });
};

const dispatchEvmLikeWithdrawForOrder = async (
  hinkal: IHinkal,
  order: DepositAndWithdrawOrderBase,
  token: ERC20Token,
  depositedUtxos: Utxo[],
): Promise<string> => {
  const userDepositedUtxos = matchDepositedUtxos(order, depositedUtxos);
  const feeStructure = buildOrderFeeStructure(order);

  await waitForDepositedUtxosInMerkleTree(hinkal, order.chainId, userDepositedUtxos);

  return hinkalWithdrawBatch(
    hinkal,
    order.chainId,
    token,
    userDepositedUtxos,
    feeStructure,
    hashEthereumAddress(order.senderAddress),
    undefined,
    order.txCompletionTime,
    order.ref,
  );
};

export const dispatchEvmWithdrawForOrder = async (
  hinkal: IHinkal,
  order: DepositAndWithdrawOrderBase,
): Promise<string> => {
  const token = resolveOrderToken(order);
  const receipt = await waitForEthereumTransactionConfirmation(order.chainId, order.txHash);
  const depositedUtxos = getOnChainUtxosFromReceipt(receipt, hinkal, order.chainId, token.erc20TokenAddress);
  return dispatchEvmLikeWithdrawForOrder(hinkal, order, token, depositedUtxos);
};

export const dispatchTronWithdrawForOrder = async (
  hinkal: IHinkal,
  order: DepositAndWithdrawOrderBase,
): Promise<string> => {
  const token = resolveOrderToken(order);
  const receipt = await waitForEthereumTransactionConfirmation(order.chainId, order.txHash);

  const depositedUtxos = getUtxosFromReceipt(
    receipt,
    order.chainId,
    token.erc20TokenAddress,
    hinkal.userKeys.getShieldedPrivateKey(),
  );
  return dispatchEvmLikeWithdrawForOrder(hinkal, order, token, depositedUtxos);
};

export const dispatchSolanaWithdrawForOrder = async (
  hinkal: IHinkal,
  order: DepositAndWithdrawOrderBase,
): Promise<string> => {
  const token = resolveOrderToken(order);

  const { rpcUrl } = networkRegistry[order.chainId];
  const { hinkalIdl } = networkRegistry[order.chainId].contractData;
  if (!hinkalIdl) throw new Error(`Missing Hinkal IDL for chain ${order.chainId}`);

  const connection = new Connection(rpcUrl, 'confirmed');
  const tx = await fetchSolanaTransaction(connection, order.txHash, 'confirmed');
  if (!tx) throw new Error(`Receipt not found for signature ${order.txHash}`);

  const program = hinkal.getSolanaProgram(hinkalIdl);
  const { compressedAddress } = formatMintAddress(token.erc20TokenAddress);
  const depositedUtxos = getOnChainUtxosFromReceiptSolana(tx, program, hinkal.userKeys, compressedAddress);

  const userDepositedUtxos = matchDepositedUtxos(order, depositedUtxos);
  const recipientAmounts = order.recipients.map((r) => BigInt(r.amount));

  await waitForDepositedUtxosInMerkleTree(hinkal, order.chainId, userDepositedUtxos);

  return hinkalSolanaWithdrawBatch(
    hinkal,
    order.chainId,
    token,
    userDepositedUtxos,
    buildOrderFeeStructure(order),
    hashEthereumAddress(order.senderAddress),
    recipientAmounts,
    undefined,
    order.txCompletionTime,
    order.ref,
  );
};
