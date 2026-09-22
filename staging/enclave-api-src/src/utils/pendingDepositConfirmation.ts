import { AdminTransactionType, Logger } from '@hinkal/common';
import { WHITELISTED_REFERRALS } from '@hinkal/backend-common';
import { PendingDepositConfirmationModel } from '../models/PendingDepositReferralSchema';
import { sealDocument } from './documentSigning';

export const resolveReferral = (ref: string | undefined): string | undefined =>
  ref && WHITELISTED_REFERRALS.includes(ref) ? ref : undefined;

// Best-effort tracking for the deposit-confirmation listener; errors are only logged, so
// callers don't await this - it runs in the background instead of blocking their response.
export const createPendingDepositConfirmation = async (
  orderId: string,
  chainId: number,
  action: AdminTransactionType,
  ethereumAddress: string,
  tokenAddresses: string[],
  amounts: string[],
  ref: string | undefined,
): Promise<void> => {
  try {
    const sealed = await sealDocument({
      orderId,
      chainId,
      action,
      ...(ref !== undefined && { ref }),
      ethereumAddress,
      tokenAddresses,
      amounts,
    });
    await PendingDepositConfirmationModel.create(sealed);
  } catch (error) {
    Logger.error(`failed to create pending deposit confirmation for orderId=${orderId}:`, error);
  }
};
