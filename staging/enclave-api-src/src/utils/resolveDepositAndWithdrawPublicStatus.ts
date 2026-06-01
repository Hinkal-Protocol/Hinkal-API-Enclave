import { DepositAndWithdrawOrderStatus } from '../models/DepositAndWithdrawOrderSchema';

export enum DepositAndWithdrawPublicStatus {
  Processing = 'processing',
  Failed = 'failed',
  Scheduled = 'scheduled',
}

export const DEPOSIT_AND_WITHDRAW_TERMINAL_STATUSES = new Set<DepositAndWithdrawPublicStatus>([
  DepositAndWithdrawPublicStatus.Failed,
  DepositAndWithdrawPublicStatus.Scheduled,
]);

export const resolveDepositAndWithdrawPublicStatus = (
  orderStatus: DepositAndWithdrawOrderStatus,
): DepositAndWithdrawPublicStatus => {
  if (orderStatus === DepositAndWithdrawOrderStatus.Failed) {
    return DepositAndWithdrawPublicStatus.Failed;
  }
  if (orderStatus === DepositAndWithdrawOrderStatus.WithdrawScheduled) {
    return DepositAndWithdrawPublicStatus.Scheduled;
  }
  return DepositAndWithdrawPublicStatus.Processing;
};
