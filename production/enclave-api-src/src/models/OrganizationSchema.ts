import mongoose, { Schema } from 'mongoose';
import { WaasPolicyAction } from '../constants/policyActions';
import { EnclaveHmac, EnclaveHmacSchema } from './EnclaveHmacSchema';

export interface PolicyRecord {
  policyId: string;
  userIds: string[];
  actionType: WaasPolicyAction;
}

export interface Organization {
  organizationId: string;
  name: string;
  policies: PolicyRecord[];
  enclaveHmac: EnclaveHmac;
}

const PolicySchema = new Schema<PolicyRecord>(
  {
    policyId: { type: String, required: true },
    userIds: { type: [String], required: true, default: [] },
    actionType: { type: String, enum: Object.values(WaasPolicyAction), required: true },
  },
  { _id: false },
);

const OrganizationSchema = new Schema<Organization>(
  {
    organizationId: { type: String, required: true, unique: true, index: true },
    name: { type: String, required: true },
    policies: { type: [PolicySchema], required: true, default: [] },
    enclaveHmac: { type: EnclaveHmacSchema, required: true },
  },
  { collection: 'organizations' },
);

export const OrganizationModel = mongoose.model<Organization>('Organization', OrganizationSchema);
