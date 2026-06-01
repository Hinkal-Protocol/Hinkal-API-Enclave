import mongoose, { Schema } from 'mongoose';

export enum DepositAndWithdrawOrderStatus {
  AwaitingDeposit = 'awaiting-deposit',
  DepositConfirmed = 'deposit-confirmed',
  WithdrawScheduled = 'withdraw-scheduled',
  Failed = 'failed',
}

export interface DepositAndWithdrawOrder {
  orderId: string;
  chainId: number;
  senderAddress: string;
  recipients: { address: string; amount: string }[];
  tokenAddress: string;
  feeToken: string;
  flatFee: string;
  variableRate: string;
  utxoAmounts: string[];
  txCompletionTime?: number;
  status: DepositAndWithdrawOrderStatus;
  txHash?: string;
  scheduleId?: string;
  preparedAt: Date;
  enclaveHmac?: object;
}

const DepositAndWithdrawOrderSchema = new Schema<DepositAndWithdrawOrder>(
  {
    orderId: { type: String, required: true, unique: true, index: true },
    chainId: { type: Number, required: true },
    senderAddress: { type: String, required: true },
    recipients: { type: [{ _id: false, address: String, amount: String }], required: true },
    tokenAddress: { type: String, required: true },
    feeToken: { type: String, required: true },
    flatFee: { type: String, required: true },
    variableRate: { type: String, required: true },
    utxoAmounts: { type: [String], required: true, default: [] },
    txCompletionTime: { type: Number },
    status: { type: String, enum: Object.values(DepositAndWithdrawOrderStatus), required: true },
    txHash: { type: String },
    scheduleId: { type: String },
    preparedAt: { type: Date, required: true, default: () => new Date() },
    enclaveHmac: { type: Object },
  },
  { strict: false, versionKey: false },
);

DepositAndWithdrawOrderSchema.index({ chainId: 1, status: 1 });

export const DepositAndWithdrawOrderModel = mongoose.model<DepositAndWithdrawOrder>(
  'DepositAndWithdrawOrder',
  DepositAndWithdrawOrderSchema,
);
