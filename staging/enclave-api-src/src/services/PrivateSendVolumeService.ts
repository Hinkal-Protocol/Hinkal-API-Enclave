import {
  getAmountInToken,
  getErrorMessage,
  getScheduledTransactionById,
  Logger,
  PartnerTransactionType,
  ScheduledTransactionItemStatus,
  ScheduledTransactionStatus,
} from '@hinkal/common';
import { getERC20Token } from '@hinkal/erc20-registry';
import mongoose from 'mongoose';
import { DEPLOYMENT_MODE } from '../constants';
import { PendingPrivateSendVolume, PendingPrivateSendVolumeModel } from '../models/PendingPrivateSendVolumeSchema';
import { emitPartnerReferralTx } from '../utils/dataServerInternal';
import { verifyRawDoc } from '../utils/documentSigning';

const LABEL = 'pending private send volume';
const SWEEP_INTERVAL_MS = 30 * 60 * 1000;
const FINISHED_PAYOUT_STATUSES = new Set<ScheduledTransactionStatus>([
  ScheduledTransactionStatus.COMPLETED,
  ScheduledTransactionStatus.FAILED,
  ScheduledTransactionStatus.DEPOSIT_FAILED,
]);

const recordCompletedPayouts = async (pending: PendingPrivateSendVolume, payouts: ScheduledTransactionItemStatus[]) => {
  const { orderId, chainId, tokenAddress, recipientAmounts } = pending;

  if (payouts.length !== recipientAmounts.length) {
    Logger.error(
      `[PrivateSendVolumeService] order ${orderId} has ${payouts.length} payouts for ${recipientAmounts.length} recipients`,
    );
    return;
  }

  const token = getERC20Token(tokenAddress, chainId);
  if (!token) {
    Logger.error(`[PrivateSendVolumeService] unknown token for order ${orderId}: ${chainId}-${tokenAddress}`);
    return;
  }

  const completed = payouts.flatMap(({ status, txHash }, index) =>
    status === ScheduledTransactionStatus.COMPLETED && txHash ? [{ txHash, amount: recipientAmounts[index] }] : [],
  );

  await Promise.all(
    completed.map(({ txHash, amount }) =>
      emitPartnerReferralTx({
        txHash,
        ref: pending.ref,
        keyId: pending.keyId,
        chainId,
        tokenAddresses: [token.erc20TokenAddress],
        amountChanges: [Number(getAmountInToken(token, BigInt(amount)))],
        variableRate: pending.variableRate,
        action: PartnerTransactionType.PrivateSend,
        partnerFeeBps: pending.partnerFeeBps,
      }),
    ),
  );
};

const syncPending = async (raw: Record<string, unknown>): Promise<void> => {
  try {
    const pending = (await verifyRawDoc(raw, LABEL)) as unknown as PendingPrivateSendVolume;
    const { transactions } = await getScheduledTransactionById(pending.scheduleId);

    await recordCompletedPayouts(pending, transactions);
    if (!transactions.every(({ status }) => FINISHED_PAYOUT_STATUSES.has(status))) return;

    await PendingPrivateSendVolumeModel.deleteOne({ scheduleId: pending.scheduleId });
  } catch (err) {
    Logger.error(`[PrivateSendVolumeService] sync failed for order ${String(raw.orderId)}:`, getErrorMessage(err));
  }
};

class PrivateSendVolumeService {
  private timer: NodeJS.Timeout | null = null;

  init(): void {
    if (this.timer) return;
    this.sweepDue();
    this.timer = setInterval(() => {
      this.sweepDue();
    }, SWEEP_INTERVAL_MS);
  }

  async syncSchedule(scheduleId: string): Promise<void> {
    try {
      const raw = await PendingPrivateSendVolumeModel.findOne({ scheduleId, deploymentMode: DEPLOYMENT_MODE }).lean();
      if (!raw) return;
      await syncPending(raw as unknown as Record<string, unknown>);
    } catch (err) {
      Logger.error(`[PrivateSendVolumeService] sync failed for schedule ${scheduleId}:`, getErrorMessage(err));
    }
  }

  private async sweepDue(): Promise<void> {
    try {
      const due = await PendingPrivateSendVolumeModel.find({
        deploymentMode: DEPLOYMENT_MODE,
        checkAfter: mongoose.trusted({ $lte: new Date() }),
      }).lean();
      await Promise.all(due.map((raw) => syncPending(raw as unknown as Record<string, unknown>)));
    } catch (err) {
      Logger.error('[PrivateSendVolumeService] sweep failed:', getErrorMessage(err));
    }
  }
}

export const privateSendVolumeService = new PrivateSendVolumeService();
