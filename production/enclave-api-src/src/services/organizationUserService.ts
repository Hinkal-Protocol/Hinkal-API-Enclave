import { API_ERROR_MESSAGES, HttpError } from '@hinkal/common';
import { OrganizationUserModel, WalletAddresses } from '../models/OrganizationUserSchema';
import { replaceSignedDoc } from '../utils/documentSigning';
import { OrganizationUserDocuments } from './organizationDocumentService';

export const appendWalletToUser = async (
  organizationId: string,
  userId: string,
  wallet: WalletAddresses,
): Promise<void> => {
  const user = await OrganizationUserDocuments.getByUserId(organizationId, userId);
  const wallets = [...(user.wallets ?? []), wallet];
  const sealed = await replaceSignedDoc(OrganizationUserModel.collection, user, { wallets });
  if (!sealed) throw new HttpError(500, API_ERROR_MESSAGES.UPDATE_USER_FAILED);
};
