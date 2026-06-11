import { generateKeyPairSync } from 'crypto';

const { publicKey, privateKey } = generateKeyPairSync('ec', {
  namedCurve: 'P-256',
  publicKeyEncoding: { type: 'spki', format: 'pem' },
  privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
});

export const enclavePublicKey = publicKey;
export const enclavePrivateKey = privateKey;
