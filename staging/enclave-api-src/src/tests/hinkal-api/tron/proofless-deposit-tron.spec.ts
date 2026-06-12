import { createEnclaveSessionTron } from '../../utils/enclaveAuthHelperTron';
import { depositUsdtToPrivate, getTronUsdtBalance } from '../../utils/tronIntegrationHelpers';
import { getPrivateBalanceForToken } from '../../utils/getPrivateBalanceTron';
import { TRON_NILE_USDT_ADDRESS } from '../../utils/tronTestConstants';
import { getEnclaveTronTestWallet, type TronTestWallet } from '../../utils/tronTestWallet';

const DEPOSIT_AMOUNT = BigInt('100000000'); // 100 USDT (6 decimals)

let wallet: TronTestWallet;

beforeAll(() => {
  wallet = getEnclaveTronTestWallet();
});

describe('proofless-deposit route (Tron Nile)', () => {
  jest.setTimeout(300_000);

  it('returns tx calldata, approves, broadcasts, and moves USDT from public to private balance', async () => {
    const authFields = await createEnclaveSessionTron(wallet.tronWeb, wallet.address);
    const balanceBefore = await getTronUsdtBalance(wallet);
    const privateBalanceBefore = await getPrivateBalanceForToken(wallet, TRON_NILE_USDT_ADDRESS, authFields);

    await depositUsdtToPrivate(wallet, DEPOSIT_AMOUNT, TRON_NILE_USDT_ADDRESS, true);

    const balanceAfter = await getTronUsdtBalance(wallet);
    expect(balanceBefore - balanceAfter).toBeGreaterThanOrEqual(DEPOSIT_AMOUNT);

    const privateBalanceAfter = await getPrivateBalanceForToken(wallet, TRON_NILE_USDT_ADDRESS, authFields);
    expect(privateBalanceAfter - privateBalanceBefore).toEqual(DEPOSIT_AMOUNT);
  });
});
