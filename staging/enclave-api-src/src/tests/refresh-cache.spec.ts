import { ethers } from 'ethers';
import { chainIds } from '@hinkal/common';
import { createJsonRpcProvider } from '@hinkal/common/functions/utils/create-provider';
import { requireEnv } from '@hinkal/common/functions/utils/requireEnv';
import { createEnclaveSession } from './utils/enclaveAuthHelper';
import { refreshCache } from './utils/enclaveIntegrationHelpers';

const CHAIN_ID = chainIds.arcTestnet;

let wallet: ethers.Wallet;

beforeAll(() => {
  const provider = createJsonRpcProvider(CHAIN_ID);
  wallet = new ethers.Wallet(requireEnv('ENCLAVE_TESTING_PRIVATE_KEY'), provider);
});

describe('refresh-cache route', () => {
  jest.setTimeout(300_000);

  it('refreshes the cached chain state for the test wallet', async () => {
    const authFields = await createEnclaveSession(wallet, CHAIN_ID);

    await expect(refreshCache(wallet, CHAIN_ID, authFields)).resolves.toBeUndefined();
  });
});
