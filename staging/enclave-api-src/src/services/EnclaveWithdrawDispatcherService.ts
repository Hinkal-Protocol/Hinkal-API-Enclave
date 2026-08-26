import {
  dispatchEvmWithdrawForOrder,
  dispatchSolanaWithdrawForOrder,
  dispatchTronWithdrawForOrder,
} from './dispatchWithdrawForOrder';
import { extractMessage, isSolanaLike, isTronLike, Logger } from '@hinkal/common';
import mongoose from 'mongoose';
import {
  DepositAndWithdrawOrder,
  DepositAndWithdrawOrderModel,
  DepositAndWithdrawOrderStatus,
} from '../models/DepositAndWithdrawOrderSchema';
import { hinkalInitializerService } from './hinkalInitializerService';
import { decryptField, publicDoc, replaceSignedDoc, verifyRawDoc } from '../utils/documentSigning';
import { liveChainStateService } from '@hinkal/backend-common';
import { assertUuid } from '../utils';

const ORDER_LABEL = 'deposit-and-withdraw order';

type RawOrder = Record<string, unknown> & { _id: mongoose.Types.ObjectId };

const toRaw = (order: DepositAndWithdrawOrder & { _id: mongoose.Types.ObjectId }): RawOrder =>
  order as unknown as RawOrder;

class EnclaveWithdrawDispatcherService {
  private async decryptOrderAddresses(
    order: DepositAndWithdrawOrder & { _id: mongoose.Types.ObjectId },
  ): Promise<DepositAndWithdrawOrder & { _id: mongoose.Types.ObjectId }> {
    const senderAddress = await decryptField(order.senderAddress);
    const recipients = order.recipients
      ? await Promise.all(
          order.recipients.map(async (r) => ({
            address: await decryptField(r.address),
            amount: await decryptField(r.amount),
          })),
        )
      : order.recipients;
    const utxoAmounts = await Promise.all(order.utxoAmounts.map((a) => decryptField(a)));
    const raw = order as unknown as Record<string, unknown>;
    const recipientAddress =
      typeof raw.recipientAddress === 'string' ? await decryptField(raw.recipientAddress) : undefined;
    const amount = typeof raw.amount === 'string' ? await decryptField(raw.amount) : undefined;
    return {
      ...order,
      senderAddress,
      recipients,
      utxoAmounts,
      ...(recipientAddress !== undefined && { recipientAddress }),
      ...(amount !== undefined && { amount }),
    };
  }

  async dispatchWithdraw(
    decryptedOrder: DepositAndWithdrawOrder & { _id: mongoose.Types.ObjectId },
    encryptedOrderRaw: RawOrder,
  ): Promise<void> {
    if (!decryptedOrder.txHash) throw new Error(`Order ${decryptedOrder.orderId} missing txHash`);
    const { txHash } = decryptedOrder;

    const scheduleId = await hinkalInitializerService.withHinkalForAddress(
      decryptedOrder.senderAddress,
      decryptedOrder.chainId,
      async (hinkal) => {
        if (isSolanaLike(decryptedOrder.chainId)) {
          return dispatchSolanaWithdrawForOrder(hinkal, { ...decryptedOrder, txHash });
        }
        if (isTronLike(decryptedOrder.chainId)) {
          return dispatchTronWithdrawForOrder(hinkal, { ...decryptedOrder, txHash });
        }
        return dispatchEvmWithdrawForOrder(hinkal, { ...decryptedOrder, txHash });
      },
    );

    await replaceSignedDoc(
      DepositAndWithdrawOrderModel.collection,
      encryptedOrderRaw,
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

    const encryptedOrder = claimed as unknown as DepositAndWithdrawOrder & { _id: mongoose.Types.ObjectId };

    const confirmed = await replaceSignedDoc(
      DepositAndWithdrawOrderModel.collection,
      toRaw(encryptedOrder),
      { status: DepositAndWithdrawOrderStatus.DepositConfirmed, txHash: event.txHash },
      { status: DepositAndWithdrawOrderStatus.AwaitingDeposit },
    );
    if (!confirmed) return;

    const decryptedOrder = await this.decryptOrderAddresses(encryptedOrder);

    const confirmedEncryptedRaw: RawOrder = {
      ...toRaw(encryptedOrder),
      status: DepositAndWithdrawOrderStatus.DepositConfirmed,
      txHash: event.txHash,
    };

    const confirmedDecryptedOrder: DepositAndWithdrawOrder & { _id: mongoose.Types.ObjectId } = {
      ...decryptedOrder,
      status: DepositAndWithdrawOrderStatus.DepositConfirmed,
      txHash: event.txHash,
    };

    try {
      await liveChainStateService.syncNow(event.chainId);
      await this.dispatchWithdraw(confirmedDecryptedOrder, confirmedEncryptedRaw);
    } catch (err) {
      const failureReason = extractMessage(err) ?? String(err);
      Logger.error(
        `[EnclaveWithdrawDispatcherService] dispatchWithdraw failed for ${event.orderId}: ${failureReason}`,
        err,
      );
      await replaceSignedDoc(
        DepositAndWithdrawOrderModel.collection,
        confirmedEncryptedRaw,
        { status: DepositAndWithdrawOrderStatus.Failed },
        { status: DepositAndWithdrawOrderStatus.DepositConfirmed },
      );
    }
  }

  async getOrder(orderId: string): Promise<DepositAndWithdrawOrder | null> {
    const raw = await DepositAndWithdrawOrderModel.findOne({ orderId: assertUuid(orderId, 'orderId') }).lean();
    const doc = await publicDoc(raw as unknown as RawOrder | null, ORDER_LABEL);
    return doc as unknown as DepositAndWithdrawOrder | null;
  }
}

export const enclaveDepositDispatcherService = new EnclaveWithdrawDispatcherService();
