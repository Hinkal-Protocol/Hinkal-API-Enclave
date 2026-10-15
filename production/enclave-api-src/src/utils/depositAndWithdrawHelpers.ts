import {
  DepositAndWithdrawResponse,
  ERC20Token,
  ExternalActionId,
  FeeStructure,
  getFeeStructure,
  hinkalPalEvmDepositPrepare,
  hinkalPalSolanaDepositPrepare,
  hinkalPalTronDepositPrepare,
  IHinkal,
  isSolanaLike,
  isTronLike,
  networkRegistry,
} from '@hinkal/common';
import { ethers } from 'ethers';
import { DepositAndWithdrawOrderModel, DepositAndWithdrawOrderStatus } from '../models';
import { DEPLOYMENT_MODE } from '../constants';
import { CreateDepositAndWithdrawOrderParams, DepositAndWithdrawRecipient } from '../types';
import { sealDocument } from './documentSigning';
import { encryptOrderFields } from './orderFieldEncryption';

export const getDepositAndWithdrawFeeStructure = (
  chainId: number,
  feeTokenAddress: string,
  token: ERC20Token,
  recipients: DepositAndWithdrawRecipient[],
  variableRate: bigint,
): Promise<FeeStructure> =>
  getFeeStructure(
    chainId,
    feeTokenAddress,
    [token.erc20TokenAddress],
    ExternalActionId.Transact,
    [],
    variableRate,
    isSolanaLike(chainId)
      ? { mintTo: token.erc20TokenAddress, recipient: recipients[0].address, nullifierCount: recipients.length }
      : undefined,
  );

export const serializeEvmTx = (unsignedTx: ethers.TransactionRequest): string => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const txData = { ...(unsignedTx as any) };
  delete txData.from;
  const evmTx = ethers.Transaction.from(txData);
  return Buffer.from(evmTx.unsignedSerialized.slice(2), 'hex').toString('base64');
};

export const prepareDepositAndWithdrawTx = async (
  hinkal: IHinkal,
  chainId: number,
  token: ERC20Token,
  recipientAmounts: bigint[],
  feeStructure: FeeStructure,
  orderId: string,
): Promise<{ serializedTx: string; utxoAmounts: bigint[] }> => {
  if (isSolanaLike(chainId)) {
    const result = await hinkalPalSolanaDepositPrepare(hinkal, chainId, token, recipientAmounts, feeStructure, orderId);
    return {
      serializedTx: Buffer.from(result.unsignedTx.serialize()).toString('base64'),
      utxoAmounts: result.utxoAmounts,
    };
  }

  if (isTronLike(chainId)) {
    const result = await hinkalPalTronDepositPrepare(hinkal, token, recipientAmounts, feeStructure, orderId);
    return {
      serializedTx: Buffer.from(JSON.stringify(result.unsignedTx)).toString('base64'),
      utxoAmounts: result.utxoAmounts,
    };
  }

  const result = await hinkalPalEvmDepositPrepare(hinkal, token, recipientAmounts, feeStructure, orderId);
  return {
    serializedTx: serializeEvmTx(result.unsignedTx),
    utxoAmounts: result.utxoAmounts,
  };
};

export const createDepositAndWithdrawOrder = async ({
  orderId,
  chainId,
  address,
  token,
  recipients,
  totalRecipientAmount,
  amountOut,
  utxoAmounts,
  feeStructure,
  serializedTx,
  attribution,
  txCompletionTime,
  bridgeQuote,
}: CreateDepositAndWithdrawOrderParams): Promise<DepositAndWithdrawResponse> => {
  const totalAmount = utxoAmounts.reduce((sum, a) => sum + a, 0n);
  const fee = totalAmount - totalRecipientAmount;

  const encryptedFields = await encryptOrderFields({
    senderAddress: address,
    recipients,
    utxoAmounts: utxoAmounts.map((a) => a.toString()),
  });

  const sealed = await sealDocument({
    orderId,
    deploymentMode: DEPLOYMENT_MODE,
    chainId,
    ...encryptedFields,
    tokenAddress: token.erc20TokenAddress,
    feeToken: feeStructure.feeToken,
    flatFee: feeStructure.flatFee.toString(),
    variableRate: feeStructure.variableRate.toString(),
    ...(txCompletionTime !== undefined && { txCompletionTime }),
    ...(attribution.ref !== undefined && { ref: attribution.ref }),
    ...(attribution.keyId !== undefined && { keyId: attribution.keyId }),
    ...(attribution.partnerFeeBps !== undefined && { partnerFeeBps: attribution.partnerFeeBps }),
    status: DepositAndWithdrawOrderStatus.AwaitingDeposit,
    ...(bridgeQuote !== undefined && { bridgeQuote }),
  });
  await DepositAndWithdrawOrderModel.create(sealed);

  const approvalAddress = isSolanaLike(chainId) ? null : (networkRegistry[chainId].contractData.hinkalAddress ?? null);

  return {
    success: true,
    orderId,
    approvalAddress,
    serializedTx,
    amountIn: totalAmount.toString(),
    amountOut: (amountOut ?? totalRecipientAmount).toString(),
    fee: fee.toString(),
  };
};
