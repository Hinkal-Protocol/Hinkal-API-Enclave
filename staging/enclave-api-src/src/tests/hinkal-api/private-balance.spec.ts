import { ethers } from 'ethers';
import { ARC_TESTNET_USDC_ADDRESS, chainIds } from '@hinkal/common';
import { createJsonRpcProvider } from '@hinkal/common/functions/utils/create-provider';
import { requireEnv } from '@hinkal/common/functions/utils/requireEnv';
import { createEnclaveSession } from '../utils/enclaveAuthHelper';
import { getPrivateBalance } from '../utils/getPrivateBalance';

const CHAIN_ID = chainIds.arcTestnet;

let wallet: ethers.Wallet;

beforeAll(() => {
  const privateKey = requireEnv('ENCLAVE_TESTING_PRIVATE_KEY');
  const provider = createJsonRpcProvider(CHAIN_ID);
  wallet = new ethers.Wallet(privateKey, provider);
});

describe('private-balance route', () => {
  jest.setTimeout(300_000);

  it('returns private balances and USDC balance is a valid non-negative amount', async () => {
    const authFields = await createEnclaveSession(wallet);
    const balances = await getPrivateBalance(wallet, CHAIN_ID, authFields);

    expect(Array.isArray(balances)).toBe(true);

    const usdcBalance = balances.find(
      ({ tokenAddress }) => tokenAddress.toLowerCase() === ARC_TESTNET_USDC_ADDRESS.toLowerCase(),
    );
    console.log('usdcBalance: ', usdcBalance);
    expect(usdcBalance).toBeDefined();
  });
});
