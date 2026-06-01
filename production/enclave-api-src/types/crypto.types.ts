export type CryptoMode = 'local' | 'kms';

export interface ICryptoHelper {
  getPublicKey(): Promise<string>;
  encrypt(plaintext: Buffer): Promise<Buffer>;
  decrypt(ciphertext: Buffer): Promise<Buffer>;
}
