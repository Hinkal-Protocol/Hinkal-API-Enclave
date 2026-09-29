import {
  dispatchEvmWithdrawForOrder,
  dispatchSolanaWithdrawForOrder,
  dispatchTronWithdrawForOrder,
} from './dispatchWithdrawForOrder';
import {
  caseInsensitiveEqual,
  extractMessage,
  getErrorMessage,
  isSolanaLike,
  isTronLike,
  Logger,
} from '@hinkal/common';
import mongoose from 'mongoose';
import {
  DepositAndWithdrawOrder,
  DepositAndWithdrawOrderModel,
  DepositAndWithdrawOrderStatus,
} from '../models/DepositAndWithdrawOrderSchema';
import { hinkalInitializerService } from './hinkalInitializerService';
import { publicDoc, replaceSignedDoc, verifyRawDoc } from '../utils/documentSigning';
import { assertUuid } from '../utils/queryGuards';
import { DEPLOYMENT_MODE } from '../constants';
import { createPendingPrivateSendVolume } from '../utils/pendingPrivateSendVolume';
import { DecodedDeposit } from '../types';

const ORDER_LABEL = 'deposit-and-withdraw order';

type RawOrder = Record<string, unknown> & { _id: mongoose.Types.ObjectId };

const toRaw = (order: DepositAndWithdrawOrder & { _id: mongoose.Types.ObjectId }): RawOrder =>
  order as unknown as RawOrder;

const trackKeyedPrivateSendVolume = async (order: DepositAndWithdrawOrder, scheduleId: string) => {
  try {
    await createPendingPrivateSendVolume(order, scheduleId);
  } catch (err) {
    Logger.error(
      `[EnclaveWithdrawDispatcherService] failed to track private send volume for ${order.orderId}:`,
      getErrorMessage(err),
    );
  }
};

class EnclaveWithdrawDispatcherService {
  async dispatchWithdraw(order: DepositAndWithdrawOrder & { _id: mongoose.Types.ObjectId }): Promise<void> {
    if (!order.txHash) throw new Error(`Order ${order.orderId} missing txHash`);
    const { txHash } = order;

    const scheduleId = await hinkalInitializerService.withHinkalForAddress(
      order.senderAddress,
      order.chainId,
      async (hinkal) => {
        if (isSolanaLike(order.chainId)) {
          return dispatchSolanaWithdrawForOrder(hinkal, { ...order, txHash });
        }
        if (isTronLike(order.chainId)) {
          return dispatchTronWithdrawForOrder(hinkal, { ...order, txHash });
        }
        return dispatchEvmWithdrawForOrder(hinkal, { ...order, txHash });
      },
    );

    await trackKeyedPrivateSendVolume(order, scheduleId);

    await replaceSignedDoc(
      DepositAndWithdrawOrderModel.collection,
      toRaw(order),
      { status: DepositAndWithdrawOrderStatus.WithdrawScheduled, scheduleId },
      { status: DepositAndWithdrawOrderStatus.DepositConfirmed },
    );
  }

  async handleDeposit(event: {
    chainId: number;
    txHash: string;
    fromAddress: string;
    orderId: string;
    deposit: DecodedDeposit | null;
  }): Promise<void> {
    if (!event.deposit) {
      Logger.error(
        `[EnclaveWithdrawDispatcherService] no verifiable deposit amount for orderId=${event.orderId} txHash=${event.txHash}, ignoring`,
      );
      return;
    }

    const raw = await DepositAndWithdrawOrderModel.findOne({
      orderId: event.orderId,
      chainId: event.chainId,
      status: DepositAndWithdrawOrderStatus.AwaitingDeposit,
      deploymentMode: DEPLOYMENT_MODE,
    }).lean();

    const claimed = await verifyRawDoc(raw as unknown as RawOrder | null, ORDER_LABEL);
    if (!claimed) return;

    const order = claimed as unknown as DepositAndWithdrawOrder & { _id: mongoose.Types.ObjectId };

    if (!this.depositMatchesOrder(order, event.deposit)) {
      Logger.error(
        `[EnclaveWithdrawDispatcherService] deposit amount mismatch for orderId=${event.orderId} txHash=${event.txHash}, ignoring`,
      );
      return;
    }

    const confirmed = await replaceSignedDoc(
      DepositAndWithdrawOrderModel.collection,
      toRaw(order),
      { status: DepositAndWithdrawOrderStatus.DepositConfirmed, txHash: event.txHash },
      { status: DepositAndWithdrawOrderStatus.AwaitingDeposit },
    );
    if (!confirmed) return;

    const confirmedOrder: DepositAndWithdrawOrder & { _id: mongoose.Types.ObjectId } = {
      ...order,
      status: DepositAndWithdrawOrderStatus.DepositConfirmed,
      txHash: event.txHash,
    };

    try {
      await this.dispatchWithdraw(confirmedOrder);
    } catch (err) {
      const failureReason = extractMessage(err) ?? String(err);
      console.error(
        `[EnclaveWithdrawDispatcherService] dispatchWithdraw failed for ${event.orderId}: ${failureReason}`,
        err,
      );
      await replaceSignedDoc(
        DepositAndWithdrawOrderModel.collection,
        toRaw(confirmedOrder),
        { status: DepositAndWithdrawOrderStatus.Failed },
        { status: DepositAndWithdrawOrderStatus.DepositConfirmed },
      );
    }
  }

  private depositMatchesOrder(order: DepositAndWithdrawOrder, deposit: DecodedDeposit): boolean {
    const expected = order.utxoAmounts.reduce((sum, a) => sum + BigInt(a), 0n);
    const deposited = deposit.erc20Addresses.reduce(
      (sum, addr, i) => (caseInsensitiveEqual(addr, order.tokenAddress) ? sum + BigInt(deposit.amounts[i]) : sum),
      0n,
    );

    return deposited === expected;
  }

  async getOrder(orderId: string): Promise<DepositAndWithdrawOrder | null> {
    const raw = await DepositAndWithdrawOrderModel.findOne({
      orderId: assertUuid(orderId, 'orderId'),
      deploymentMode: DEPLOYMENT_MODE,
    }).lean();
    const doc = await publicDoc(raw as unknown as RawOrder | null, ORDER_LABEL);
    return doc as unknown as DepositAndWithdrawOrder | null;
  }
}

export const enclaveDepositDispatcherService = new EnclaveWithdrawDispatcherService();
