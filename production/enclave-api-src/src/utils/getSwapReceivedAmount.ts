import {
  ERC20Token,
  formatMintAddress,
  getOnChainUtxosFromReceipt,
  getOnChainUtxosFromReceiptSolana,
  IHinkal,
  isSolanaLike,
  Logger,
  networkRegistry,
  Utxo,
  waitForEthereumTransactionConfirmation,
  waitForSolanaTransactionConfirmation,
} from '@hinkal/common';

const getSwapOutputUtxos = async (
  hinkal: IHinkal,
  chainId: number,
  txHash: string,
  outToken: ERC20Token,
): Promise<Utxo[]> => {
  if (isSolanaLike(chainId)) {
    const { hinkalIdl } = networkRegistry[chainId].contractData;
    if (!hinkalIdl) throw new Error(`Missing Hinkal IDL for chain ${chainId}`);
    const tx = await waitForSolanaTransactionConfirmation(chainId, txHash);
    const { compressedAddress } = formatMintAddress(outToken.erc20TokenAddress);
    return getOnChainUtxosFromReceiptSolana(tx, hinkal.getSolanaProgram(hinkalIdl), hinkal.userKeys, compressedAddress);
  }

  const receipt = await waitForEthereumTransactionConfirmation(chainId, txHash);
  return getOnChainUtxosFromReceipt(receipt, hinkal, chainId, outToken.erc20TokenAddress);
};

export const getSwapReceivedAmount = async (
  hinkal: IHinkal,
  chainId: number,
  txHash: string,
  outToken: ERC20Token,
): Promise<string | undefined> => {
  try {
    const [outputUtxo] = await getSwapOutputUtxos(hinkal, chainId, txHash, outToken);
    return outputUtxo && outputUtxo.amount > 0n ? outputUtxo.amount.toString() : undefined;
  } catch (err) {
    Logger.error(`[getSwapReceivedAmount] could not read swap output for tx ${txHash} on chain ${chainId}:`, err);
    return undefined;
  }
};
