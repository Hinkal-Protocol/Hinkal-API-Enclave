import { createSign } from 'crypto';
import { verificationPrivateKey } from '../enclaveKeypair';

export const signResponseBody = (body: string): string => {
  const sign = createSign('SHA256');
  sign.update(body);
  return sign.sign({ key: verificationPrivateKey, dsaEncoding: 'ieee-p1363' }, 'base64');
};
