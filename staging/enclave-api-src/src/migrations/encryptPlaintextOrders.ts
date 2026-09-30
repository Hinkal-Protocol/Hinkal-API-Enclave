/* eslint-disable no-await-in-loop */
import mongoose from 'mongoose';
import { DEPLOYMENT_MODE } from '../constants';
import { DepositAndWithdrawOrder, DepositAndWithdrawOrderModel } from '../models/DepositAndWithdrawOrderSchema';
import { replaceSignedDoc } from '../utils/documentSigning';
import { encryptOrderFields } from '../utils/orderFieldEncryption';

type RawOrder = DepositAndWithdrawOrder & { _id: mongoose.Types.ObjectId; recipientAddress?: string };

// should be removed after we run this script once in the production
export const encryptPlaintextOrders = async () => {
  const cursor = DepositAndWithdrawOrderModel.collection.find({
    deploymentMode: DEPLOYMENT_MODE,
    $expr: { $lt: [{ $strLenCP: '$senderAddress' }, 100] },
  });

  let migrated = 0;
  let deletedPal = 0;

  for (let doc = await cursor.next(); doc; doc = await cursor.next()) {
    const raw = doc as RawOrder;
    if (raw.recipientAddress !== undefined) {
      await DepositAndWithdrawOrderModel.collection.deleteOne({ _id: raw._id });
      deletedPal += 1;
    } else {
      const encryptedFields = await encryptOrderFields(raw);
      const sealed = await replaceSignedDoc(DepositAndWithdrawOrderModel.collection, raw, encryptedFields, {
        enclaveHmac: raw.enclaveHmac,
      });
      if (sealed) migrated += 1;
    }
  }

  return { migrated, deletedPal };
};
