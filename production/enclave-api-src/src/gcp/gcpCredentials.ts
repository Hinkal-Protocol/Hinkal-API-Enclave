import { BaseExternalAccountClient, ExternalAccountClient } from 'google-auth-library';

const CLOUD_PLATFORM_SCOPE = 'https://www.googleapis.com/auth/cloud-platform';
const ATTESTATION_TOKEN_PATH = '/run/container_launcher/attestation_verifier_claims_token';
const USABLE_TIMEOUT_MS = 5 * 60 * 1000;
const USABLE_POLL_DELAY_MS = 5 * 1000;

const buildEnclaveCredentials = (enclaveSaEmail: string, wifAudience: string): BaseExternalAccountClient => {
  const client = ExternalAccountClient.fromJSON({
    type: 'external_account',
    audience: wifAudience,
    subject_token_type: 'urn:ietf:params:oauth:token-type:jwt',
    token_url: 'https://sts.googleapis.com/v1/token',
    service_account_impersonation_url: `https://iamcredentials.googleapis.com/v1/projects/-/serviceAccounts/${enclaveSaEmail}:generateAccessToken`,
    credential_source: { file: ATTESTATION_TOKEN_PATH },
    scopes: [CLOUD_PLATFORM_SCOPE],
  });
  if (!client) throw new Error('Failed to build attested enclave credentials');
  return client;
};

// The workload identity binding authorizing this image digest is created moments before
// the instance boots, and IAM grants take time to propagate, so callers minting a token
// at startup would otherwise be denied.
const waitUntilUsable = async (client: BaseExternalAccountClient): Promise<void> => {
  const deadline = Date.now() + USABLE_TIMEOUT_MS;
  /* eslint-disable no-await-in-loop */
  for (;;) {
    try {
      await client.getAccessToken();
      return;
    } catch (err) {
      if (Date.now() > deadline) {
        throw new Error(`credentials unusable after ${USABLE_TIMEOUT_MS}ms: ${(err as Error).message}`);
      }
      await new Promise((resolve) => {
        setTimeout(resolve, USABLE_POLL_DELAY_MS);
      });
    }
  }
};

export const getEnclaveCredentials = async (
  enclaveSaEmail: string,
  wifAudience: string,
): Promise<BaseExternalAccountClient> => {
  const client = buildEnclaveCredentials(enclaveSaEmail, wifAudience);
  await waitUntilUsable(client);
  return client;
};
