import {
  addressEqual,
  BPS_DENOMINATOR,
  calculateGrossUtxoAmounts,
  calculateTotalFee,
  calculateWithdrawalAmount,
  DepositAndBridgeQuote,
  ERC20Token,
  extractMessage,
  FeeStructure,
  getDepositAndBridgeQuote,
  getLifiBridgeFees,
  getReceiveVaultSettlement,
  IHinkal,
  isSolanaLike,
  isTronLike,
  Logger,
  ReceiveVaultSettlement,
  THROWN_ERROR_MESSAGES,
} from '@hinkal/common';
import { getERC20Token } from '@hinkal/erc20-registry';
import { UpdateQuery } from 'mongoose';
import { TransferPayoutModel } from '../models/TransferPayoutSchema';
import { DEPLOYMENT_MODE, MONGO_DUPLICATE_KEY_ERROR } from '../constants';
import { createPendingPrivateSendVolume } from '../utils/pendingPrivateSendVolume';
import { getDepositAndWithdrawFeeStructure } from '../utils/depositAndWithdrawHelpers';
import {
  DepositAndWithdrawRecipient,
  ReceiveVaultBinding,
  TransferBridge,
  TransferPayout,
  TransferPayoutStatus,
} from '../types';
import { hinkalInitializerService } from './hinkalInitializerService';
import {
  DepositAndWithdrawOrderBase,
  dispatchBridgeQuoteForOrder,
  dispatchEvmWithdrawForOrder,
  dispatchSolanaWithdrawForOrder,
  dispatchTronWithdrawForOrder,
} from './dispatchWithdrawForOrder';
import { loadBinding } from './receiveVaultBinding';

type TransferPayoutOrder = DepositAndWithdrawOrderBase & Pick<ReceiveVaultBinding, 'keyId' | 'partnerFeeBps'>;

type PayoutRequest = {
  base: Omit<TransferPayoutOrder, 'recipients' | 'feeToken' | 'flatFee' | 'variableRate'>;
  settlement: ReceiveVaultSettlement;
  recipientAddress: string;
  variableRate: bigint;
};

type DispatchedPayout = { order: TransferPayoutOrder; scheduleId: string };

// Note a bridge spends, and the fee and recipients it is dispatched with.
type BridgeCost = { gross: bigint; feeStructure: FeeStructure; recipients: DepositAndWithdrawRecipient[] };

const payoutKey = (chainId: number, settleTxHash: string) => `${chainId}:${settleTxHash}`;

// Writes only if the status is still the one read, so a concurrent change or a late result cannot overwrite it.
const updatePayout = (
  { chainId, settleTxHash, status }: Pick<TransferPayout, 'chainId' | 'settleTxHash' | 'status'>,
  update: UpdateQuery<TransferPayout>,
) => TransferPayoutModel.updateOne({ chainId, settleTxHash, status }, update);

const dispatchWithdraw = (hinkal: IHinkal, order: DepositAndWithdrawOrderBase): Promise<string> => {
  if (isSolanaLike(order.chainId)) return dispatchSolanaWithdrawForOrder(hinkal, order);
  if (isTronLike(order.chainId)) return dispatchTronWithdrawForOrder(hinkal, order);
  return dispatchEvmWithdrawForOrder(hinkal, order);
};

const feeFields = ({ feeToken, flatFee, variableRate }: FeeStructure) => ({
  feeToken,
  flatFee: flatFee.toString(),
  variableRate: variableRate.toString(),
});

// Sized as private-send-bridge sizes its deposit.
const bridgeCost = async (
  hinkal: IHinkal,
  token: ERC20Token,
  quote: DepositAndBridgeQuote,
  variableRate: bigint,
): Promise<BridgeCost> => {
  const [lifi] = quote.lifiRecipients ?? [];
  if (lifi) {
    const fees = await getLifiBridgeFees(hinkal, token, [lifi], variableRate);
    // The settled note is the only input: there is no native note to pay LIFI's extra fee from.
    if (fees.needsNativeDeposit) throw new Error(THROWN_ERROR_MESSAGES.TRANSFER_BRIDGE_NATIVE_FEE_NOT_SUPPORTED);
    return {
      gross: fees.mainTokenAmounts[0],
      feeStructure: fees.feeStructure,
      recipients: [{ address: lifi.recipientAddress, amount: lifi.bridgeAmount.toString() }],
    };
  }

  const [leg] = quote.nearLegs ?? [];
  if (!leg) throw new Error(THROWN_ERROR_MESSAGES.NO_RECIPIENTS_TO_BRIDGE);
  const recipients = [{ address: leg.depositAddress, amount: leg.amount.toString() }];
  const feeStructure = await getDepositAndWithdrawFeeStructure(
    token.chainId,
    token.erc20TokenAddress,
    token,
    recipients,
    variableRate,
  );
  const gross = isSolanaLike(token.chainId)
    ? leg.amount + calculateTotalFee(leg.amount, feeStructure)
    : calculateGrossUtxoAmounts([leg.amount], feeStructure)[0];
  return { gross, feeStructure, recipients };
};

const withdrawPayout = async (
  hinkal: IHinkal,
  { base, settlement, recipientAddress, variableRate }: PayoutRequest,
): Promise<DispatchedPayout> => {
  const token = getERC20Token(settlement.tokenAddress, base.chainId);
  if (!token) throw new Error(THROWN_ERROR_MESSAGES.TOKEN_NOT_FOUND_ON_CHAIN);
  // Solana prices recipient account rent into the fee, so it needs the recipient.
  const feeStructure = await getDepositAndWithdrawFeeStructure(
    base.chainId,
    settlement.tokenAddress,
    token,
    [{ address: recipientAddress, amount: settlement.amount.toString() }],
    variableRate,
  );
  // The whole note is withdrawn and the fee comes out of it, so the recipient (and partner volume) gets the rest.
  // EVM/Tron charge the variable fee on the note minus the flat fee, Solana on what the recipient gets.
  const net = isSolanaLike(base.chainId)
    ? calculateWithdrawalAmount(-settlement.amount, feeStructure)
    : ((settlement.amount - feeStructure.flatFee) * (BPS_DENOMINATOR - feeStructure.variableRate)) / BPS_DENOMINATOR;
  if (net <= 0n) throw new Error(THROWN_ERROR_MESSAGES.INSUFFICIENT_BALANCE_TO_COVER_FEE);
  const order = {
    ...base,
    recipients: [{ address: recipientAddress, amount: net.toString() }],
    ...feeFields(feeStructure),
  };
  return { order, scheduleId: await dispatchWithdraw(hinkal, order) };
};

// The amount is only known now, so the fee comes out of it: quote once to price the fee, again for what is left.
const bridgePayout = async (
  hinkal: IHinkal,
  { base, settlement, recipientAddress, variableRate }: PayoutRequest,
  { destinationChainId, destinationTokenAddress, slippagePercentage }: TransferBridge,
): Promise<DispatchedPayout> => {
  const token = getERC20Token(settlement.tokenAddress, base.chainId);
  const destinationToken = getERC20Token(destinationTokenAddress, destinationChainId);
  if (!token || !destinationToken) throw new Error(THROWN_ERROR_MESSAGES.TOKEN_NOT_FOUND_ON_CHAIN);

  const probeQuote = await getDepositAndBridgeQuote(
    hinkal,
    token,
    destinationToken,
    [settlement.amount],
    [recipientAddress],
    slippagePercentage,
  );
  const probe = await bridgeCost(hinkal, token, probeQuote, variableRate);
  const probeFee = probe.gross - settlement.amount;
  const net = settlement.amount - probeFee;
  if (net <= 0n) throw new Error(THROWN_ERROR_MESSAGES.INSUFFICIENT_BALANCE_TO_COVER_FEE);

  const quote = await getDepositAndBridgeQuote(
    hinkal,
    token,
    destinationToken,
    [net],
    [recipientAddress],
    slippagePercentage,
  );
  const cost = await bridgeCost(hinkal, token, quote, variableRate);
  const costFee = cost.gross - net;

  // Prices move between the two quotes: pay the first fee by taking any rise off the flat fee.
  // The relayer's own fee validation rejects it if that leaves the flat fee too low.
  const flatFee = cost.feeStructure.flatFee - (costFee - probeFee);

  const order = {
    ...base,
    recipients: cost.recipients,
    ...feeFields({ ...cost.feeStructure, flatFee }),
  };
  return { order, scheduleId: await dispatchBridgeQuoteForOrder(hinkal, order, quote) };
};

const transferBridgeOf = ({
  destinationChainId,
  destinationTokenAddress,
  slippagePercentage,
}: ReceiveVaultBinding): TransferBridge | undefined =>
  destinationChainId === undefined || destinationTokenAddress === undefined
    ? undefined
    : { destinationChainId, destinationTokenAddress, slippagePercentage };

const withdrawToRecipient = async (
  chainId: number,
  settleTxHash: string,
  binding: ReceiveVaultBinding,
  settlement: ReceiveVaultSettlement,
): Promise<void> => {
  const { creatorAddress, recipientAddress } = binding;
  const request: PayoutRequest = {
    base: {
      orderId: payoutKey(chainId, settleTxHash),
      chainId,
      senderAddress: creatorAddress,
      utxoAmounts: [settlement.amount.toString()],
      tokenAddress: settlement.tokenAddress,
      ref: binding.attributionRef,
      keyId: binding.keyId,
      partnerFeeBps: binding.partnerFeeBps,
      txHash: settleTxHash,
    },
    settlement,
    recipientAddress,
    variableRate: BigInt(binding.variableRate),
  };
  const bridge = transferBridgeOf(binding);
  // An EVM vault works on every EVM chain, so a payment can arrive already in the destination token: nothing to bridge.
  const needsBridge =
    bridge &&
    !(
      bridge.destinationChainId === chainId &&
      addressEqual(chainId, bridge.destinationTokenAddress, settlement.tokenAddress)
    );

  const { order, scheduleId } = await hinkalInitializerService.withHinkalForAddress(
    creatorAddress,
    chainId,
    (hinkal) => (needsBridge ? bridgePayout(hinkal, request, bridge) : withdrawPayout(hinkal, request)),
  );
  await updatePayout(
    { chainId, settleTxHash, status: TransferPayoutStatus.Processing },
    { $set: { status: TransferPayoutStatus.WithdrawScheduled, scheduleId } },
  );
  await createPendingPrivateSendVolume(order, scheduleId).catch((err) =>
    Logger.error(`[transfer-settle] failed to track partner volume for ${payoutKey(chainId, settleTxHash)}:`, err),
  );
};

// Failures are only recorded: VaultRefundService refunds the note of an address that has a refundTo.
const payOut = (
  chainId: number,
  settleTxHash: string,
  binding: ReceiveVaultBinding,
  settlement: ReceiveVaultSettlement,
) =>
  withdrawToRecipient(chainId, settleTxHash, binding, settlement)
    .catch((err) => {
      Logger.error(`[transfer-settle] withdraw failed for ${payoutKey(chainId, settleTxHash)}:`, err);
      return updatePayout(
        { chainId, settleTxHash, status: TransferPayoutStatus.Processing },
        {
          $set: { status: TransferPayoutStatus.Failed, error: extractMessage(err) ?? String(err) },
        },
      );
    })
    .catch((err) =>
      Logger.error(`[transfer-settle] could not record failure for ${payoutKey(chainId, settleTxHash)}:`, err),
    );

// The caller only names the tx: vault, token and amount come from the chain, the recipient from the sealed binding.
export const handleTransferSettle = async (chainId: number, settleTxHash: string): Promise<void> => {
  const settlement = await getReceiveVaultSettlement(chainId, settleTxHash);
  if (!settlement) return;
  const binding = await loadBinding(chainId, settlement.vaultAddress);
  if (!binding) {
    Logger.error(
      `[transfer-settle] no binding for vault ${settlement.vaultAddress} (${payoutKey(chainId, settleTxHash)}); the payment stays blocked`,
    );
    return;
  }

  try {
    await TransferPayoutModel.create({
      chainId,
      settleTxHash,
      status: TransferPayoutStatus.Processing,
      deploymentMode: DEPLOYMENT_MODE,
    });
  } catch (err) {
    if ((err as { code?: number }).code === MONGO_DUPLICATE_KEY_ERROR) return;
    throw err;
  }

  // Not awaited: merkle sync and proving outlast the HTTP call.
  payOut(chainId, settleTxHash, binding, settlement);
};
