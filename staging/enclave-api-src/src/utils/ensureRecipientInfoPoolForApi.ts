import { ensureRecipientInfoPool, getErrorMessage, Logger } from '@hinkal/common';
import { hinkalInitializerService } from '../services/hinkalInitializerService';

export const ensureRecipientInfoPoolForApi = async (
  organizationId: string,
  userId: string,
  walletAddress: string,
  signerPublicKey: string,
  chainId: number,
): Promise<void> => {
  await hinkalInitializerService.withHinkalForOrganization(
    organizationId,
    userId,
    signerPublicKey,
    walletAddress,
    chainId,
    async (hinkal) => ensureRecipientInfoPool(hinkal, walletAddress),
    true,
  );
};

export const ensureRecipientInfoPoolForApiInBackground = (
  ...args: Parameters<typeof ensureRecipientInfoPoolForApi>
): void => {
  ensureRecipientInfoPoolForApi(...args).catch((err) =>
    Logger.error('ensureRecipientInfoPoolForApi failed', getErrorMessage(err), err),
  );
};
