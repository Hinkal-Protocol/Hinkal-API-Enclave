import { AdminTransactionType } from '@hinkal/common';

export type CreateOrganizationRequestBody = {
  organizationName: string;
};

export type CreateUserRequestBody = {
  organizationId: string;
  publicKey: string;
};

export type CreateWalletRequestBody = {
  organizationId: string;
  userId: string;
};

export type AddPolicyRequestBody = {
  organizationId: string;
  policy: { userIds: string[]; actionType: AdminTransactionType };
};

export type RemovePolicyRequestBody = {
  organizationId: string;
  policyId: string;
};

export type UpdatePolicyRequestBody = {
  organizationId: string;
  policyId: string;
  newPolicy: { userIds: string[]; actionType: AdminTransactionType };
};
