import { HttpError } from '@hinkal/common';
import { OrganizationModel, OrganizationUserModel, PolicyRecord } from '../models';
import { replaceSignedDoc } from '../utils/documentSigning';
import { Organization } from '../models/OrganizationSchema';
import { OrganizationDocuments, OrganizationUserDocuments } from './organizationDocumentService';

const computeAllowedActions = (userId: string, policies: PolicyRecord[]): string[] =>
  [...new Set(policies.filter((policy) => policy.userIds.includes(userId)).map((policy) => policy.actionType))].sort();

const syncAllowedActions = async (organizationId: string, policies: PolicyRecord[]): Promise<void> => {
  const users = await OrganizationUserDocuments.listByOrganization(organizationId);

  await Promise.all(
    users.map(async (user) => {
      const allowedActions = computeAllowedActions(user.userId, policies);
      await replaceSignedDoc(OrganizationUserModel.collection, user, { allowedActions });
    }),
  );
};

const updateOrganizationPolicies = async (
  organizationId: string,
  org: Organization,
  policies: PolicyRecord[],
): Promise<PolicyRecord[]> => {
  const sealed = await replaceSignedDoc(OrganizationModel.collection, org, { policies });
  if (!sealed) throw new HttpError(500, 'Failed to update organization');

  await syncAllowedActions(organizationId, policies);
  return policies;
};

export const addOrganizationPolicy = async (organizationId: string, policy: PolicyRecord): Promise<PolicyRecord[]> => {
  const org = await OrganizationDocuments.get(organizationId);
  const policies = [...(org.policies ?? []), policy];
  return updateOrganizationPolicies(organizationId, org, policies);
};

export const removeOrganizationPolicy = async (organizationId: string, policyId: string): Promise<PolicyRecord[]> => {
  const org = await OrganizationDocuments.get(organizationId);
  const currentPolicies = org.policies ?? [];
  const policies = currentPolicies.filter((policy) => policy.policyId !== policyId);

  if (policies.length === currentPolicies.length) {
    throw new HttpError(404, 'Policy not found');
  }

  return updateOrganizationPolicies(organizationId, org, policies);
};

export const updateOrganizationPolicy = async (
  organizationId: string,
  policyId: string,
  newPolicy: PolicyRecord,
): Promise<PolicyRecord[]> => {
  const org = await OrganizationDocuments.get(organizationId);
  const currentPolicies = org.policies ?? [];
  let found = false;

  const policies = currentPolicies.map((policy) => {
    if (policy.policyId !== policyId) return policy;
    found = true;
    return newPolicy;
  });

  if (!found) throw new HttpError(404, 'Policy not found');

  return updateOrganizationPolicies(organizationId, org, policies);
};
