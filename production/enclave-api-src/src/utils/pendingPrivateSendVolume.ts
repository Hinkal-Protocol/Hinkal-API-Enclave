import { DEPLOYMENT_MODE } from '../constants';
import { DepositAndWithdrawOrder } from '../models/DepositAndWithdrawOrderSchema';
import {
  PENDING_PRIVATE_SEND_VOLUME_CHECK_DELAY_MS,
  PENDING_PRIVATE_SEND_VOLUME_GRACE_MS,
  PendingPrivateSendVolumeModel,
} from '../models/PendingPrivateSendVolumeSchema';
import { sealDocument } from './documentSigning';

const getCompletionTimeMs = (txCompletionTime: number | undefined) =>
  Math.max((txCompletionTime ?? 0) * 1000, Date.now());

export const createPendingPrivateSendVolume = async (
  order: DepositAndWithdrawOrder,
  scheduleId: string,
): Promise<void> => {
  const { orderId, ref, keyId, partnerFeeBps, chainId, tokenAddress, recipients, variableRate, txCompletionTime } =
    order;
  if (!ref || !keyId || !recipients?.length) return;

  const completionTimeMs = getCompletionTimeMs(txCompletionTime);
  const sealed = await sealDocument({
    orderId,
    deploymentMode: DEPLOYMENT_MODE,
    scheduleId,
    chainId,
    tokenAddress,
    recipientAmounts: recipients.map(({ amount }) => amount),
    variableRate,
    ref,
    keyId,
    partnerFeeBps: partnerFeeBps ?? 0,
    checkAfter: new Date(completionTimeMs + PENDING_PRIVATE_SEND_VOLUME_CHECK_DELAY_MS),
    expireAt: new Date(completionTimeMs + PENDING_PRIVATE_SEND_VOLUME_GRACE_MS),
  });

  await PendingPrivateSendVolumeModel.findOneAndReplace({ orderId }, sealed, { upsert: true });
};
