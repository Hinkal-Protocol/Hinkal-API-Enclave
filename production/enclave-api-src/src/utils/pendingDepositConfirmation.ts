import { AdminTransactionType } from '@hinkal/common';
import { WHITELISTED_REFERRALS } from '@hinkal/backend-common';
import { PendingDepositConfirmationModel } from '../models/PendingDepositReferralSchema';
import { sealDocument } from './documentSigning';
import { DEPLOYMENT_MODE } from '../constants';

export const resolveReferral = (ref: string | undefined): string | undefined =>
  ref && WHITELISTED_REFERRALS.includes(ref) ? ref : undefined;

export const createPendingDepositConfirmation = async (
  orderId: string,
  chainId: number,
  action: AdminTransactionType,
  ethereumAddress: string,
  tokenAddresses: string[],
  amounts: string[],
  ref: string | undefined,
): Promise<void> => {
  const sealed = await sealDocument({
    orderId,
    chainId,
    action,
    ...(ref !== undefined && { ref }),
    ethereumAddress,
    tokenAddresses,
    amounts,
    deploymentMode: DEPLOYMENT_MODE,
  });
  await PendingDepositConfirmationModel.create(sealed);
};
