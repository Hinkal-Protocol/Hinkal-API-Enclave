import { caseInsensitiveEqual } from '@hinkal/common';
import { createEnclaveSessionTron } from '../../utils/enclaveAuthHelperTron';
import { getPrivateBalance } from '../../utils/getPrivateBalanceTron';
import { TRON_NILE_CHAIN_ID, TRON_NILE_USDT_ADDRESS } from '../../utils/tronTestConstants';
import { getEnclaveTronTestWallet, type TronTestWallet } from '../../utils/tronTestWallet';

let wallet: TronTestWallet;

beforeAll(() => {
  wallet = getEnclaveTronTestWallet();
});

describe('private-balance route (Tron Nile)', () => {
  jest.setTimeout(300_000);

  it('returns private balances and USDT balance is a valid non-negative amount', async () => {
    const authFields = await createEnclaveSessionTron(wallet.tronWeb, wallet.address, TRON_NILE_CHAIN_ID);
    const balances = await getPrivateBalance(wallet, authFields);

    expect(Array.isArray(balances)).toBe(true);

    const usdtBalance = balances.find(({ tokenAddress }) => caseInsensitiveEqual(tokenAddress, TRON_NILE_USDT_ADDRESS));

    expect(usdtBalance).toBeDefined();
    expect(BigInt(usdtBalance?.balance ?? '0') >= 0n).toBe(true);
  });
});
