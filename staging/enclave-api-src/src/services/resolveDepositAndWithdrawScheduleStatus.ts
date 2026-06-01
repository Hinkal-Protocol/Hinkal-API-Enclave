import { getScheduledTransactionById, Logger, ScheduledTransactionItemStatus } from '@hinkal/common';

export const resolveDepositAndWithdrawScheduleStatus = async (
  scheduleId: string,
): Promise<ScheduledTransactionItemStatus[] | null> => {
  try {
    const scheduled = await getScheduledTransactionById(scheduleId);
    return scheduled.transactions;
  } catch (err) {
    Logger.error(`[resolveDepositAndWithdrawScheduleStatus] failed for scheduleId ${scheduleId}`, err);
    return null;
  }
};
