import { cryptoHelper } from '../crypto';
import { DepositAndWithdrawOrder } from '../models/DepositAndWithdrawOrderSchema';

type OrderSensitiveFields = Pick<DepositAndWithdrawOrder, 'senderAddress' | 'recipients' | 'utxoAmounts'>;

export const encryptField = async (value: string): Promise<string> => {
  const encrypted = await cryptoHelper.encrypt(Buffer.from(value, 'utf8'));
  return encrypted.toString('base64');
};

export const decryptField = async (blob: string): Promise<string> => {
  const decrypted = await cryptoHelper.decrypt(Buffer.from(blob, 'base64'));
  return decrypted.toString('utf8');
};

const transformOrderFields = async (
  fields: OrderSensitiveFields,
  transform: (value: string) => Promise<string>,
): Promise<OrderSensitiveFields> => {
  const [senderAddress, recipients, utxoAmounts] = await Promise.all([
    transform(fields.senderAddress),
    Promise.all(
      fields.recipients.map(async ({ address, amount }) => ({
        address: await transform(address),
        amount: await transform(amount),
      })),
    ),
    Promise.all(fields.utxoAmounts.map(transform)),
  ]);
  return { senderAddress, recipients, utxoAmounts };
};

export const encryptOrderFields = (fields: OrderSensitiveFields) => transformOrderFields(fields, encryptField);

export const decryptOrderFields = (fields: OrderSensitiveFields) => transformOrderFields(fields, decryptField);
