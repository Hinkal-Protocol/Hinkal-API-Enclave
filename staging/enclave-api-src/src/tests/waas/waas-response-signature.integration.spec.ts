import nacl from 'tweetnacl';
import { ENCLAVE_API_URL } from '@hinkal/common';
import { WaasHttpClient } from '../utils/waasHttpClient';

jest.setTimeout(60_000);

describe('WAAS response signing', () => {
  const client = new WaasHttpClient(ENCLAVE_API_URL);
  const signer = nacl.sign.keyPair();

  it('signs a WAAS response and echoes the request nonce', async () => {
    // The request is rejected on validation, but the rejection itself must be signed and carry our nonce.
    await expect(
      client.getJson('/waas/get-wallets', { organizationId: 'not-a-uuid', userId: 'none' }, signer),
    ).rejects.toThrow(/failed \(400\)/);
  });

  it('refuses a response the enclave did not sign', async () => {
    // /ping is a static liveness string registered before the signing middleware, so it is never signed.
    await expect(client.getJson('/ping', {}, signer)).rejects.toThrow('responded without x-hinkal-response-signature');
  });
});
