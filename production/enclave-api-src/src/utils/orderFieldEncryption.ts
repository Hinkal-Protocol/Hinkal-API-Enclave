import { createCipheriv, createDecipheriv, randomBytes } from 'crypto';
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

export const encryptLargeField = async (value: string): Promise<string> => {
  const key = randomBytes(32);
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', key, iv);
  const ciphertext = Buffer.concat([cipher.update(value, 'utf8'), cipher.final()]);
  const encryptedKey = await cryptoHelper.encrypt(key);
  return [encryptedKey, iv, cipher.getAuthTag(), ciphertext].map((part) => part.toString('base64')).join('.');
};

export const decryptLargeField = async (blob: string): Promise<string> => {
  const [encryptedKey, iv, authTag, ciphertext] = blob.split('.').map((part) => Buffer.from(part, 'base64'));
  const decipher = createDecipheriv('aes-256-gcm', await cryptoHelper.decrypt(encryptedKey), iv);
  decipher.setAuthTag(authTag);
  return Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString('utf8');
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
