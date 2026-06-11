import { createSign } from 'crypto';
import { enclavePrivateKey } from '../enclaveKeypair';

export const signResponseBody = (body: string): string => {
  const sign = createSign('SHA256');
  sign.update(body);
  return sign.sign(enclavePrivateKey, 'base64');
};
