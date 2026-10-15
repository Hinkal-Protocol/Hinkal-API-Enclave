import { caseInsensitiveEqual, getErrorMessage } from '@hinkal/common';
import { Request, Response } from 'express';
import { enclaveDepositDispatcherService } from '../services/EnclaveWithdrawDispatcherService';
import { resolveDepositAndWithdrawScheduleStatus } from '../services/resolveDepositAndWithdrawScheduleStatus';
import { resolveDepositAndWithdrawPublicStatus } from './resolveDepositAndWithdrawPublicStatus';
import { decryptField } from './orderFieldEncryption';

export const getDepositAndWithdrawOrderStatus = (isBridgeOrder: boolean) => async (req: Request, res: Response) => {
  try {
    const { orderId } = req.params as { orderId: string };
    const order = await enclaveDepositDispatcherService.getOrder(orderId);

    const decryptedSenderAddress = await decryptField(order?.senderAddress ?? '');

    if (
      !order ||
      Boolean(order.bridgeQuote) !== isBridgeOrder ||
      !caseInsensitiveEqual(decryptedSenderAddress, res.locals.address as string)
    ) {
      res.status(404).json({ success: false, error: `Order ${orderId} not found` });
      return;
    }

    const scheduledTransactions = order.scheduleId
      ? await resolveDepositAndWithdrawScheduleStatus(order.scheduleId)
      : null;

    res.status(200).json({
      success: true,
      status: resolveDepositAndWithdrawPublicStatus(order.status),
      ...(scheduledTransactions && { scheduledTransactions }),
    });
  } catch (err) {
    res.status(500).json({ success: false, error: getErrorMessage(err) });
  }
};
