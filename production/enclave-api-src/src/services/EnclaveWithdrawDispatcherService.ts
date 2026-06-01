import { dispatchEvmWithdrawForOrder, dispatchSolanaWithdrawForOrder } from './dispatchWithdrawForOrder';
import { extractMessage, isSolanaLike, Logger } from '@hinkal/common';
import mongoose from 'mongoose';
import {
  DepositAndWithdrawOrder,
  DepositAndWithdrawOrderModel,
  DepositAndWithdrawOrderStatus,
} from '../models/DepositAndWithdrawOrderSchema';
import { hinkalInitializerService } from './hinkalInitializerService';
import { publicDoc, replaceSignedDoc, verifyRawDoc } from '../utils/documentSigning';

const ORDER_LABEL = 'deposit-and-withdraw order';

type RawOrder = Record<string, unknown> & { _id: mongoose.Types.ObjectId };

const toRaw = (order: DepositAndWithdrawOrder & { _id: mongoose.Types.ObjectId }): RawOrder =>
  order as unknown as RawOrder;

class EnclaveWithdrawDispatcherService {
  async dispatchWithdraw(order: DepositAndWithdrawOrder & { _id: mongoose.Types.ObjectId }): Promise<void> {
    if (!order.txHash) throw new Error(`Order ${order.orderId} missing txHash`);

    const hinkal = await hinkalInitializerService.initalizeHinkalForAddress(order.senderAddress, order.chainId);

    const scheduleId = isSolanaLike(order.chainId)
      ? await dispatchSolanaWithdrawForOrder(hinkal, { ...order, txHash: order.txHash })
      : await dispatchEvmWithdrawForOrder(hinkal, { ...order, txHash: order.txHash });

    await replaceSignedDoc(
      DepositAndWithdrawOrderModel.collection,
      toRaw(order),
      { status: DepositAndWithdrawOrderStatus.WithdrawScheduled, scheduleId },
      { status: DepositAndWithdrawOrderStatus.DepositConfirmed },
    );
  }

  async handleDeposit(event: { chainId: number; txHash: string; fromAddress: string; orderId: string }): Promise<void> {
    const raw = await DepositAndWithdrawOrderModel.findOne({
      orderId: event.orderId,
      status: DepositAndWithdrawOrderStatus.AwaitingDeposit,
    }).lean();

    const claimed = await verifyRawDoc(raw as unknown as RawOrder | null, ORDER_LABEL);
    if (!claimed) return;

    const order = claimed as unknown as DepositAndWithdrawOrder & { _id: mongoose.Types.ObjectId };

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
      Logger.error(
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

  async getOrder(orderId: string): Promise<DepositAndWithdrawOrder | null> {
    const raw = await DepositAndWithdrawOrderModel.findOne({ orderId }).lean();
    const doc = await publicDoc(raw as unknown as RawOrder | null, ORDER_LABEL);
    return doc as unknown as DepositAndWithdrawOrder | null;
  }
}

export const enclaveDepositDispatcherService = new EnclaveWithdrawDispatcherService();
