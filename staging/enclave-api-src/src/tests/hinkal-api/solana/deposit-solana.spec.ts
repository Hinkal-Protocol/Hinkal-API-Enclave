import { createEnclaveSolanaSession } from '../../utils/enclaveSolanaAuthHelper';
import { depositUsdcToPrivate, getSolanaTokenBalance } from '../../utils/solanaIntegrationHelpers';
import { getPrivateBalanceForToken } from '../../utils/getPrivateBalanceSolana';
import { SOLANA_MAINNET_USDC_ADDRESS } from '../../utils/solanaTestConstants';
import { getEnclaveSolanaTestWallet, type SolanaTestWallet } from '../../utils/solanaTestWallet';

const DEPOSIT_AMOUNT = BigInt('1000'); // 0.001 USDC (6 decimals)

let wallet: SolanaTestWallet;

beforeAll(() => {
  wallet = getEnclaveSolanaTestWallet();
});

describe('deposit route (Solana mainnet)', () => {
  jest.setTimeout(300_000);

  it('returns tx calldata, signs, broadcasts, and moves USDC from public to private balance', async () => {
    const authFields = await createEnclaveSolanaSession(wallet);
    const balanceBefore = await getSolanaTokenBalance(wallet);
    const privateBalanceBefore = await getPrivateBalanceForToken(wallet, SOLANA_MAINNET_USDC_ADDRESS, authFields);

    await depositUsdcToPrivate(wallet, DEPOSIT_AMOUNT, authFields, SOLANA_MAINNET_USDC_ADDRESS, false);

    const balanceAfter = await getSolanaTokenBalance(wallet);
    expect(balanceBefore - balanceAfter).toBeGreaterThanOrEqual(DEPOSIT_AMOUNT);

    const privateBalanceAfter = await getPrivateBalanceForToken(wallet, SOLANA_MAINNET_USDC_ADDRESS, authFields);
    expect(privateBalanceAfter - privateBalanceBefore).toEqual(DEPOSIT_AMOUNT);
  });
});
