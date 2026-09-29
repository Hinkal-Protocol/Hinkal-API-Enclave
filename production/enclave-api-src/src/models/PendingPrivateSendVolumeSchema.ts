import mongoose, { Schema } from 'mongoose';

export const PENDING_PRIVATE_SEND_VOLUME_CHECK_DELAY_MS = 10 * 60 * 1000;
export const PENDING_PRIVATE_SEND_VOLUME_GRACE_MS = 7 * 24 * 60 * 60 * 1000;

export interface PendingPrivateSendVolume {
  orderId: string;
  deploymentMode: string;
  scheduleId: string;
  chainId: number;
  tokenAddress: string;
  recipientAmounts: string[];
  variableRate: string;
  ref: string;
  keyId: string;
  partnerFeeBps: number;
  checkAfter: Date;
  expireAt: Date;
  enclaveHmac?: object;
}

const PendingPrivateSendVolumeSchema = new Schema<PendingPrivateSendVolume>({
  orderId: { type: String, required: true, unique: true },
  deploymentMode: { type: String, required: true },
  scheduleId: { type: String, required: true, unique: true },
  chainId: { type: Number, required: true },
  tokenAddress: { type: String, required: true },
  recipientAmounts: { type: [String], required: true },
  variableRate: { type: String, required: true },
  ref: { type: String, required: true },
  keyId: { type: String, required: true },
  partnerFeeBps: { type: Number, required: true },
  checkAfter: { type: Date, required: true },
  expireAt: { type: Date, required: true, expires: 0 },
  enclaveHmac: { type: Object },
});

PendingPrivateSendVolumeSchema.index({ deploymentMode: 1, checkAfter: 1 });

export const PendingPrivateSendVolumeModel = mongoose.model<PendingPrivateSendVolume>(
  'PendingPrivateSendVolume',
  PendingPrivateSendVolumeSchema,
);
