import { HttpError } from '@hinkal/common';
import { OrganizationUser, UserRole } from '../models/OrganizationUserSchema';
import { OrganizationUserDocuments } from '../services/organizationDocumentService';

export const findSignerOrThrow = async (organizationId: string, signerPublicKey: string): Promise<OrganizationUser> =>
  OrganizationUserDocuments.getByPublicKey(organizationId, signerPublicKey);

export const requireRoot = (signer: OrganizationUser, action: string): void => {
  if (signer.role !== UserRole.Root) throw new HttpError(403, `Only root users can ${action}`);
};

export const requireActionPermission = (caller: OrganizationUser, action: string): void => {
  if (caller.role === UserRole.Root) return;
  const allowedActions = caller.allowedActions ?? [];
  if (!allowedActions.includes(action)) {
    throw new HttpError(403, `${action} not permitted`);
  }
};

export const requireRootOrSelf = (signer: OrganizationUser, userId: string): void => {
  if (signer.role !== UserRole.Root && signer.userId !== userId) throw new HttpError(403, 'Access denied');
};

export const resolveTargetUser = async (
  organizationId: string,
  userId: string,
  signerPublicKey: string,
): Promise<OrganizationUser> => {
  const signer = await findSignerOrThrow(organizationId, signerPublicKey);
  requireRootOrSelf(signer, userId);
  if (signer.userId === userId) return signer;
  return OrganizationUserDocuments.getByUserId(organizationId, userId);
};
