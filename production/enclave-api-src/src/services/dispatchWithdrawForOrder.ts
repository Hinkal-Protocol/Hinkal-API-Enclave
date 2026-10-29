import { Connection } from '@solana/web3.js';
import {
  AdminTransactionType,
  caseInsensitiveEqual,
  DestinationMetadata,
  ERC20Token,
  FeeStructure,
  fetchSolanaTransaction,
  formatMintAddress,
  getOnChainUtxosFromReceipt,
  getOnChainUtxosFromReceiptSolana,
  getUtxosFromReceipt,
  hashEthereumAddress,
  hinkalBridgeBatch,
  hinkalSolanaWithdrawBatch,
  hinkalWithdrawBatch,
  IHinkal,
  isSolanaLike,
  networkRegistry,
  PublicBridgeRecipient,
  PublicBridgeRecipientUtxo,
  RecipientUtxo,
  THROWN_ERROR_MESSAGES,
  Utxo,
  waitForDepositedUtxosInMerkleTree,
  waitForEthereumTransactionConfirmation,
  zeroAddress,
} from '@hinkal/common';
import { getERC20Token } from '@hinkal/erc20-registry';
import { parsePrivateSendBridgeQuote } from '../utils/privateSendBridgeQuote';
import { decryptLargeField } from '../utils/orderFieldEncryption';

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
  if (!token)
    throw new Error(`${THROWN_ERROR_MESSAGES.TOKEN_NOT_FOUND_ON_CHAIN}: ${order.tokenAddress}, ${order.chainId}`);
  return token;
};

const buildOrderFeeStructure = (order: DepositAndWithdrawOrderBase): FeeStructure => ({
  feeToken: order.feeToken,
  flatFee: BigInt(order.flatFee),
  variableRate: BigInt(order.variableRate),
});

const matchDepositedUtxos = (order: DepositAndWithdrawOrderBase, depositedUtxos: Utxo[]): RecipientUtxo[] => {
  if (depositedUtxos.length === 0)
    throw new Error(`${THROWN_ERROR_MESSAGES.NO_DEPOSITED_UTXOS_FOUND_IN_TX}: ${order.txHash}`);

  const utxoAmounts = order.utxoAmounts.map((s) => BigInt(s));
  const availableUtxos = [...depositedUtxos];
  return utxoAmounts.map((amount, i) => {
    const matchIndex = availableUtxos.findIndex((u) => u.amount === amount);
    if (matchIndex === -1)
      throw new Error(`${THROWN_ERROR_MESSAGES.NO_UTXO_FOUND_MATCHING_AMOUNT_FOR_RECIPIENT}: ${amount}, ${i}`);
    const [match] = availableUtxos.splice(matchIndex, 1);
    return { recipientAddress: order.recipients[i].address, utxo: match };
  });
};

const dispatchEvmLikeWithdrawForOrder = async (
  hinkal: IHinkal,
  order: DepositAndWithdrawOrderBase,
  token: ERC20Token,
  depositedUtxos: Utxo[],
  action = AdminTransactionType.ApiPrivateSend,
  destination?: DestinationMetadata,
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
    order.txCompletionTime,
    order.ref,
    action,
    undefined,
    destination,
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
  action = AdminTransactionType.ApiPrivateSend,
  destination?: DestinationMetadata,
): Promise<string> => {
  const token = resolveOrderToken(order);
  const receipt = await waitForEthereumTransactionConfirmation(order.chainId, order.txHash);

  const depositedUtxos = getUtxosFromReceipt(
    receipt,
    order.chainId,
    token.erc20TokenAddress,
    hinkal.userKeys.getShieldedPrivateKey(),
  );
  return dispatchEvmLikeWithdrawForOrder(hinkal, order, token, depositedUtxos, action, destination);
};

export const dispatchSolanaWithdrawForOrder = async (
  hinkal: IHinkal,
  order: DepositAndWithdrawOrderBase,
  action = AdminTransactionType.ApiPrivateSend,
  displayRecipients?: string[],
  destination?: DestinationMetadata,
): Promise<string> => {
  const token = resolveOrderToken(order);

  const { rpcUrl } = networkRegistry[order.chainId];
  const { hinkalIdl } = networkRegistry[order.chainId].contractData;
  if (!hinkalIdl) throw new Error(`${THROWN_ERROR_MESSAGES.MISSING_HINKAL_IDL_FOR_CHAIN}: ${order.chainId}`);

  const connection = new Connection(rpcUrl, 'confirmed');
  const tx = await fetchSolanaTransaction(connection, order.txHash, 'confirmed');
  if (!tx) throw new Error(`${THROWN_ERROR_MESSAGES.RECEIPT_NOT_FOUND_FOR_SIGNATURE}: ${order.txHash}`);

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
    order.txCompletionTime,
    order.ref,
    action,
    undefined,
    displayRecipients,
    destination,
  );
};

const dispatchLifiBridgeForOrder = async (
  hinkal: IHinkal,
  order: DepositAndWithdrawOrderBase,
  token: ERC20Token,
  recipients: PublicBridgeRecipient[],
): Promise<string> => {
  const receipt = await waitForEthereumTransactionConfirmation(order.chainId, order.txHash);
  const depositedUtxos = getOnChainUtxosFromReceipt(receipt, hinkal, order.chainId, token.erc20TokenAddress);
  const userDepositedUtxos = matchDepositedUtxos(order, depositedUtxos);

  const isNativeInput = caseInsensitiveEqual(token.erc20TokenAddress, zeroAddress);
  const needsNativeDeposit = !isNativeInput && recipients.some((recipient) => recipient.quote.nativeFee > 0n);
  const nativeDepositedUtxos = needsNativeDeposit
    ? matchDepositedUtxos(
        { ...order, utxoAmounts: recipients.map((recipient) => recipient.quote.nativeFee.toString()) },
        getOnChainUtxosFromReceipt(receipt, hinkal, order.chainId, zeroAddress),
      )
    : [];

  const recipientBridgeUtxos: PublicBridgeRecipientUtxo[] = recipients.map((recipient, i) => ({
    ...recipient,
    utxo: userDepositedUtxos[i].utxo,
    nativeUtxo: needsNativeDeposit ? nativeDepositedUtxos[i].utxo : undefined,
  }));

  const feeStructures: FeeStructure[] = recipients.map((recipient, i) => {
    const netAmount = isNativeInput ? recipient.bridgeAmount + recipient.quote.nativeFee : recipient.bridgeAmount;
    return { feeToken: order.feeToken, flatFee: BigInt(order.utxoAmounts[i]) - netAmount, variableRate: 0n };
  });

  await waitForDepositedUtxosInMerkleTree(hinkal, order.chainId, [...userDepositedUtxos, ...nativeDepositedUtxos]);

  return hinkalBridgeBatch(
    hinkal,
    order.chainId,
    token,
    recipientBridgeUtxos,
    feeStructures,
    hashEthereumAddress(order.senderAddress),
    order.txCompletionTime,
    order.ref,
    AdminTransactionType.ApiPrivateSendBridge,
    BigInt(order.variableRate),
  );
};

export const dispatchBridgeForOrder = async (
  hinkal: IHinkal,
  order: DepositAndWithdrawOrderBase & { bridgeQuote: string },
): Promise<string> => {
  const token = resolveOrderToken(order);
  const { quote } = parsePrivateSendBridgeQuote(
    hinkal,
    await decryptLargeField(order.bridgeQuote),
    order.senderAddress,
    order.chainId,
    token.erc20TokenAddress,
  );

  const { lifiRecipients, nearLegs = [], destinationChainId, destinationTokenAddress } = quote;
  if (lifiRecipients?.length) return dispatchLifiBridgeForOrder(hinkal, order, token, lifiRecipients);

  const destination: DestinationMetadata = {
    chainId: destinationChainId === order.chainId ? undefined : destinationChainId,
    tokenAddress: destinationTokenAddress,
    tokenAmounts: nearLegs.map((leg) => leg.quote.amountOut),
  };

  if (isSolanaLike(order.chainId)) {
    return dispatchSolanaWithdrawForOrder(
      hinkal,
      order,
      AdminTransactionType.ApiPrivateSendBridge,
      nearLegs.map((leg) => leg.destinationRecipient),
      destination,
    );
  }
  return dispatchTronWithdrawForOrder(hinkal, order, AdminTransactionType.ApiPrivateSendBridge, destination);
};
