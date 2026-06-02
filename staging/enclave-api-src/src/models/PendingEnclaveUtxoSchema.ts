import mongoose, { Schema } from 'mongoose';

const PendingEnclaveUtxoSchema = new Schema(
  {
    dedupKey: { type: String, required: true, unique: true },
    chainId: { type: Number, required: true },
    senderAddress: { type: String, required: true },
    recipientAddress: { type: String, required: true },
    utxo: { type: Schema.Types.Mixed, required: true },
    attempts: { type: Number, default: 0 },
  },
  { timestamps: true },
);

export const PendingEnclaveUtxoModel = mongoose.model('PendingEnclaveUtxo', PendingEnclaveUtxoSchema);
