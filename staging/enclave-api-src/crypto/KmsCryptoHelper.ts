import type { ICryptoHelper } from '../types';
import { stripPemToBase64Der } from './crypto.utils';
import { rsaOaepSha1Encrypt } from './rsaOaepSha1';
import { KmsManagement } from '../kms/KmsManagement';

export class KmsCryptoHelper implements ICryptoHelper {
  constructor(private readonly kms: KmsManagement = new KmsManagement()) {}

  async getPublicKey(): Promise<string> {
    const pem = await this.kms.getPublicKeyPem();
    return stripPemToBase64Der(pem);
  }

  async encrypt(plaintext: Buffer): Promise<Buffer> {
    const pem = await this.kms.getPublicKeyPem();
    return rsaOaepSha1Encrypt(pem, plaintext);
  }

  async decrypt(ciphertext: Buffer): Promise<Buffer> {
    return this.kms.asymmetricDecrypt(ciphertext);
  }
}
