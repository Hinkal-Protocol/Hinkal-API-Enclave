import * as forge from 'node-forge';

const RSA_OAEP_SHA1 = {
  md: forge.md.sha1.create(),
  mgf1: { md: forge.md.sha1.create() },
} as const;

export const rsaOaepSha1Encrypt = (publicKeyPem: string, plaintext: Buffer): Buffer => {
  const publicKey = forge.pki.publicKeyFromPem(publicKeyPem);
  const encrypted = publicKey.encrypt(plaintext.toString('binary'), 'RSA-OAEP', RSA_OAEP_SHA1);
  return Buffer.from(encrypted, 'binary');
};

export const rsaOaepSha1Decrypt = (privateKeyPem: string, ciphertext: Buffer): Buffer => {
  const privateKey = forge.pki.privateKeyFromPem(privateKeyPem);
  const decrypted = privateKey.decrypt(ciphertext.toString('binary'), 'RSA-OAEP', RSA_OAEP_SHA1);
  return Buffer.from(decrypted, 'binary');
};

export const publicKeyPemFromPrivateKeyPem = (privateKeyPem: string): string => {
  const privateKey = forge.pki.privateKeyFromPem(privateKeyPem);
  return forge.pki.publicKeyToPem(forge.pki.setRsaPublicKey(privateKey.n, privateKey.e));
};
