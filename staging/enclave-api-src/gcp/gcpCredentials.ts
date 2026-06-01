import { GoogleAuth, Impersonated } from 'google-auth-library';
import { ENCLAVE_SA_EMAIL } from '../constants';

const CLOUD_PLATFORM_SCOPE = 'https://www.googleapis.com/auth/cloud-platform';

export const getEnclaveCredentials = async () => {
  const auth = new GoogleAuth({ scopes: [CLOUD_PLATFORM_SCOPE] });
  const sourceClient = await auth.getClient();

  return new Impersonated({
    sourceClient,
    targetPrincipal: ENCLAVE_SA_EMAIL,
    targetScopes: [CLOUD_PLATFORM_SCOPE],
  });
};
