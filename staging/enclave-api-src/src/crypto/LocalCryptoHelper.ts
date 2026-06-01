import { LOCAL_RSA_PRIVATE_KEY_PEM } from '../constants';
import type { ICryptoHelper } from '../types';
import { stripPemToBase64Der } from './crypto.utils';
import { publicKeyPemFromPrivateKeyPem, rsaOaepSha1Decrypt, rsaOaepSha1Encrypt } from './rsaOaepSha1';

export class LocalCryptoHelper implements ICryptoHelper {
  private readonly privateKeyPem: string;

  private readonly publicKeyPem: string;

  constructor() {
    this.privateKeyPem = LOCAL_RSA_PRIVATE_KEY_PEM;
    this.publicKeyPem = publicKeyPemFromPrivateKeyPem(this.privateKeyPem);
  }

  async getPublicKey(): Promise<string> {
    return stripPemToBase64Der(this.publicKeyPem);
  }

  async encrypt(plaintext: Buffer): Promise<Buffer> {
    return rsaOaepSha1Encrypt(this.publicKeyPem, plaintext);
  }

  async decrypt(ciphertext: Buffer): Promise<Buffer> {
    return rsaOaepSha1Decrypt(this.privateKeyPem, ciphertext);
  }
}
