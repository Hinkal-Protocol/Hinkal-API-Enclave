import { ScheduledTransactionStatus, waitLittle } from '@hinkal/common';
import { DepositAndWithdrawPublicStatus } from '../../utils/resolveDepositAndWithdrawPublicStatus';

export const DEFAULT_POLL_INTERVAL_MS = 5_000;
export const DEFAULT_POLL_TIMEOUT_MS = 5 * 60_000;

export interface DepositAndWithdrawStatusSnapshot {
  status: DepositAndWithdrawPublicStatus | string;
  scheduledTransactions?: {
    status: ScheduledTransactionStatus | string;
    scheduledTime: string;
    txHash: string | null;
  }[];
}

const isPollingComplete = (data: DepositAndWithdrawStatusSnapshot): boolean => {
  if (data.status === DepositAndWithdrawPublicStatus.Failed || data.status === 'failed') return true;
  if (data.status !== DepositAndWithdrawPublicStatus.Scheduled && data.status !== 'scheduled') return false;
  const scheduledTransactions = data.scheduledTransactions ?? [];
  return (
    scheduledTransactions.length > 0 &&
    scheduledTransactions.every(
      (tx) => tx.status === ScheduledTransactionStatus.COMPLETED || tx.status === ScheduledTransactionStatus.FAILED,
    )
  );
};

export const pollDepositAndWithdrawUntilComplete = async <T extends DepositAndWithdrawStatusSnapshot>(
  fetchStatus: () => Promise<T>,
  options?: { label?: string; timeoutMs?: number; intervalMs?: number },
): Promise<T> => {
  const timeoutMs = options?.timeoutMs ?? DEFAULT_POLL_TIMEOUT_MS;
  const intervalMs = options?.intervalMs ?? DEFAULT_POLL_INTERVAL_MS;
  const label = options?.label ?? 'order';
  const deadline = Date.now() + timeoutMs;

  while (Date.now() < deadline) {
    // eslint-disable-next-line no-await-in-loop
    const data = await fetchStatus();
    if (isPollingComplete(data)) {
      if (data.status === DepositAndWithdrawPublicStatus.Failed || data.status === 'failed') {
        throw new Error(`${label} failed`);
      }
      const failedCount =
        data.scheduledTransactions?.filter((tx) => tx.status === ScheduledTransactionStatus.FAILED).length ?? 0;
      if (failedCount > 0) {
        throw new Error(`${label} has ${failedCount} failed scheduled transaction(s)`);
      }
      return data;
    }
    // eslint-disable-next-line no-await-in-loop
    await waitLittle(intervalMs);
  }
  throw new Error(`Status poll timed out after ${timeoutMs / 1000}s for ${label}`);
};
