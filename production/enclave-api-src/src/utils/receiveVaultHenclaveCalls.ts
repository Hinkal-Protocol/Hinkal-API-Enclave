import { API_CONFIG, httpClient, ReceiveVaultRecoverWithFeeCall } from '@hinkal/common';
import { ENCLAVE_URL } from '@hinkal/common/functions/snarkjs/constant';
import { buildInternalHmacAuthHeaders } from '@hinkal/backend-common';
import { DEPLOYMENT_MODE, RECOVER_WITH_FEE_ROUTES, RELAYER_COMMUNICATION_KEY } from '../constants';
import { RecentlyAttemptedVault } from '../types';

// henclave signs and sends the call with its relay key, which keeps the fee; returns the tx hash.
export const executeReceiveVaultRecoverWithFee = async ({
  network,
  ...body
}: ReceiveVaultRecoverWithFeeCall): Promise<string> => {
  const path = RECOVER_WITH_FEE_ROUTES[network];
  const response = await httpClient.post<{ status: string; message?: string; error?: string }>(
    `${ENCLAVE_URL}${path}`,
    body,
    { headers: buildInternalHmacAuthHeaders(RELAYER_COMMUNICATION_KEY, path, body) },
  );
  if (response.status !== 'success' || !response.message) throw new Error(response.error ?? 'recoverWithFee failed');
  return response.message;
};

// henclave lists API-key vaults the keeper found funds in after since, with those chains.
export const loadRecentlyAttemptedVaults = async (since: Date): Promise<RecentlyAttemptedVault[]> => {
  const path = API_CONFIG.ROUTES.listRecentlyAttemptedReceiveVaults;
  const body = { deploymentMode: DEPLOYMENT_MODE, since: since.getTime() };
  const { vaults } = await httpClient.post<{ vaults: RecentlyAttemptedVault[] }>(`${ENCLAVE_URL}${path}`, body, {
    headers: buildInternalHmacAuthHeaders(RELAYER_COMMUNICATION_KEY, path, body),
  });
  return vaults;
};
