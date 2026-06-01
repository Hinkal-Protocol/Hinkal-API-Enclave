import { KeyManagementServiceClient } from '@google-cloud/kms';
import { GCP_PROJECT_ID, GCP_REGION, KMS_KEY_ID, KMS_KEY_RING_ID, KMS_KEY_VERSION } from '../constants';
import { getEnclaveCredentials } from '../gcp/gcpCredentials';

export class KmsManagement {
  private kmsClient: KeyManagementServiceClient | null = null;

  private publicKeyPem: string | null = null;

  private pemFetchPromise: Promise<string> | null = null;

  private get client(): KeyManagementServiceClient {
    if (!this.kmsClient) {
      throw new Error('KmsManagement client is not initialized. Call init() first.');
    }
    return this.kmsClient;
  }

  get keyVersionName(): string {
    return this.client.cryptoKeyVersionPath(GCP_PROJECT_ID, GCP_REGION, KMS_KEY_RING_ID, KMS_KEY_ID, KMS_KEY_VERSION);
  }

  async init(): Promise<void> {
    if (this.kmsClient) return;

    const credentials = await getEnclaveCredentials();
    this.kmsClient = new KeyManagementServiceClient({ authClient: credentials });
  }

  async getPublicKeyPem(): Promise<string> {
    if (this.publicKeyPem) return this.publicKeyPem;

    if (!this.pemFetchPromise) {
      this.pemFetchPromise = this.fetchPublicKeyPem();
    }

    return this.pemFetchPromise;
  }

  async asymmetricDecrypt(ciphertext: Buffer): Promise<Buffer> {
    await this.init();
    const [response] = await this.client.asymmetricDecrypt({
      name: this.keyVersionName,
      ciphertext,
    });

    if (!response.plaintext) {
      throw new Error('KMS asymmetricDecrypt returned empty plaintext');
    }

    return Buffer.from(response.plaintext);
  }

  private async fetchPublicKeyPem(): Promise<string> {
    await this.init();
    const [response] = await this.client.getPublicKey({ name: this.keyVersionName });

    if (!response.pem) {
      throw new Error('KMS getPublicKey returned empty pem');
    }

    this.publicKeyPem = response.pem;
    return response.pem;
  }
}
