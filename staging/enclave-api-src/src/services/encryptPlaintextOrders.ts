import { isRecipientAddressInvalid, isSolanaLike, isTronLike } from '@hinkal/common';
import mongoose from 'mongoose';
import { DepositAndWithdrawOrder, DepositAndWithdrawOrderModel } from '../models/DepositAndWithdrawOrderSchema';
import { encryptField, replaceSignedDoc } from '../utils/documentSigning';

type RawOrder = DepositAndWithdrawOrder & {
  _id: mongoose.Types.ObjectId;
  recipientAddress?: string;
  amount?: string;
};

const isValidSenderAddress = (raw: RawOrder): boolean => {
  return !isRecipientAddressInvalid(raw.senderAddress, isSolanaLike(raw.chainId), isTronLike(raw.chainId));
};

const isPalOrder = (raw: RawOrder): boolean => raw.recipientAddress !== undefined;

const encryptOne = async (
  raw: RawOrder,
): Promise<'migrated' | 'skipped-already-encrypted' | 'deleted-pal-order' | 'not-found'> => {
  try {
    if (!isValidSenderAddress(raw)) return 'skipped-already-encrypted';
  } catch (err) {
    return 'skipped-already-encrypted';
  }

  if (isPalOrder(raw)) {
    await DepositAndWithdrawOrderModel.collection.deleteOne({ _id: raw._id });
    return 'deleted-pal-order';
  }

  const [senderAddress, recipients, utxoAmounts] = await Promise.all([
    encryptField(raw.senderAddress),
    Promise.all(
      raw.recipients.map(async (r) => ({
        address: await encryptField(r.address),
        amount: await encryptField(r.amount),
      })),
    ),
    Promise.all(raw.utxoAmounts.map(encryptField)),
  ]);

  const updates: Record<string, unknown> = {
    senderAddress,
    recipients,
    utxoAmounts,
  };

  const sealed = await replaceSignedDoc(DepositAndWithdrawOrderModel.collection, raw, updates);
  return sealed ? 'migrated' : 'not-found';
};

export interface EncryptPlaintextOrdersResult {
  migrated: number;
  'deleted-pal-order': number;
  durationSeconds: number;
}

export const encryptPlaintextOrders = async (): Promise<EncryptPlaintextOrdersResult> => {
  const startedAt = Date.now();

  const cursor = DepositAndWithdrawOrderModel.collection.find({
    $expr: { $lt: [{ $strLenCP: '$senderAddress' }, 100] },
  });

  const counts: Omit<EncryptPlaintextOrdersResult, 'durationSeconds'> = {
    migrated: 0,
    'deleted-pal-order': 0,
  };

  // eslint-disable-next-line no-await-in-loop
  let doc = await cursor.next();

  while (doc) {
    // eslint-disable-next-line no-await-in-loop
    const result = await encryptOne(doc as RawOrder);
    if (result === 'migrated' || result === 'deleted-pal-order') {
      counts[result] += 1;
    }
    // eslint-disable-next-line no-await-in-loop
    doc = await cursor.next();
  }

  return { ...counts, durationSeconds: (Date.now() - startedAt) / 1000 };
};
