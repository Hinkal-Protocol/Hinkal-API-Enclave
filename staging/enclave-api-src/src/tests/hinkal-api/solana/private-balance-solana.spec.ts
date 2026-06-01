import { caseInsensitiveEqual, ENCLAVE_API_URL, httpClient } from '@hinkal/common';
import { createEnclaveSolanaSession } from '../../utils/enclaveSolanaAuthHelper';
import { SOLANA_MAINNET_CHAIN_ID, SOLANA_MAINNET_USDC_ADDRESS } from '../../utils/solanaTestConstants';
import { getEnclaveSolanaTestWallet, type SolanaTestWallet } from '../../utils/solanaTestWallet';
import { toEnclaveAuthQueryParams } from '../../utils/enclaveAuthHelper';
import { BalanceResponse } from '../../../types';

let wallet: SolanaTestWallet;

beforeAll(() => {
  wallet = getEnclaveSolanaTestWallet();
});

describe('private-balance route (Solana mainnet)', () => {
  jest.setTimeout(300_000);

  it('returns private balances and USDC balance is a valid non-negative amount', async () => {
    const authFields = await createEnclaveSolanaSession(wallet);
    const params = new URLSearchParams(toEnclaveAuthQueryParams(authFields, wallet.address, SOLANA_MAINNET_CHAIN_ID));

    const response = await httpClient.get<BalanceResponse>(`${ENCLAVE_API_URL}/balance?${params}`);

    if (response.success === false) throw new Error(response.error);

    const { balances } = response;

    expect(Array.isArray(balances)).toBe(true);

    const usdcBalance = balances.find(({ tokenAddress }) =>
      caseInsensitiveEqual(tokenAddress, SOLANA_MAINNET_USDC_ADDRESS),
    );

    expect(usdcBalance).toBeDefined();
    expect(BigInt(usdcBalance?.balance ?? '0') >= 0n).toBe(true);
  });
});
