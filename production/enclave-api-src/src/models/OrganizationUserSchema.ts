import mongoose, { Schema } from 'mongoose';
import { EnclaveHmac, EnclaveHmacSchema } from './EnclaveHmacSchema';

export enum UserRole {
  Root = 'root',
  Admin = 'admin',
  User = 'user',
}

export interface WalletAddresses {
  evmAddress?: string;
  tronAddress?: string;
  solanaAddress?: string;
}

export interface OrganizationUser {
  organizationId: string;
  userId: string;
  publicKey: string;
  role: UserRole;
  encryptedMnemonic: string;
  wallets: WalletAddresses[];
  allowedActions: string[];
  enclaveHmac: EnclaveHmac;
}

const WalletAddressesSchema = new Schema<WalletAddresses>(
  {
    evmAddress: { type: String },
    tronAddress: { type: String },
    solanaAddress: { type: String },
  },
  { _id: false },
);

const OrganizationUserSchema = new Schema<OrganizationUser>(
  {
    organizationId: { type: String, required: true, index: true },
    userId: { type: String, required: true, index: true },
    publicKey: { type: String, required: true, unique: true, index: true },
    role: { type: String, enum: Object.values(UserRole), required: true },
    encryptedMnemonic: { type: String, required: true },
    wallets: { type: [WalletAddressesSchema], required: true, default: [] },
    allowedActions: { type: [String], required: true, default: [] },
    enclaveHmac: { type: EnclaveHmacSchema, required: true },
  },
  { collection: 'organizationusers' },
);

OrganizationUserSchema.index({ organizationId: 1, userId: 1 }, { unique: true });
OrganizationUserSchema.index({ 'wallets.evmAddress': 1 }, { unique: true, sparse: true });
OrganizationUserSchema.index({ 'wallets.tronAddress': 1 }, { unique: true, sparse: true });
OrganizationUserSchema.index({ 'wallets.solanaAddress': 1 }, { unique: true, sparse: true });

export const OrganizationUserModel = mongoose.model<OrganizationUser>('OrganizationUser', OrganizationUserSchema);
