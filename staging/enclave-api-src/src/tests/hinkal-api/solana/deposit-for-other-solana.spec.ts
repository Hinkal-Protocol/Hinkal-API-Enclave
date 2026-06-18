import { createEnclaveSolanaSession } from '../../utils/enclaveSolanaAuthHelper';
import { depositForOtherUsdc, getRecipientInfo, getSolanaTokenBalance } from '../../utils/solanaIntegrationHelpers';
import { getPrivateBalanceForToken } from '../../utils/getPrivateBalanceSolana';
import { SOLANA_MAINNET_USDC_ADDRESS } from '../../utils/solanaTestConstants';
import {
  getEnclaveSolanaRecipientTestWallet,
  getEnclaveSolanaTestWallet,
  type SolanaTestWallet,
} from '../../utils/solanaTestWallet';

const DEPOSIT_AMOUNT = BigInt('1000'); // 0.001 USDC (6 decimals)

let senderWallet: SolanaTestWallet;
let recipientWallet: SolanaTestWallet;

beforeAll(() => {
  senderWallet = getEnclaveSolanaTestWallet();
  recipientWallet = getEnclaveSolanaRecipientTestWallet();
});

describe('deposit-for-other route (Solana mainnet)', () => {
  jest.setTimeout(300_000);

  it('returns tx calldata, signs, broadcasts, and increases recipient private balance by deposit amount', async () => {
    const recipientAuthFields = await createEnclaveSolanaSession(recipientWallet);
    const recipientInfo = await getRecipientInfo(recipientWallet, recipientAuthFields);

    const senderBalanceBefore = await getSolanaTokenBalance(senderWallet);
    const recipientPrivateBalanceBefore = await getPrivateBalanceForToken(
      recipientWallet,
      SOLANA_MAINNET_USDC_ADDRESS,
      recipientAuthFields,
    );

    const senderAuthFields = await createEnclaveSolanaSession(senderWallet);

    await depositForOtherUsdc(senderWallet, DEPOSIT_AMOUNT, recipientInfo, senderAuthFields);

    const senderBalanceAfter = await getSolanaTokenBalance(senderWallet);
    expect(senderBalanceBefore - senderBalanceAfter).toBeGreaterThanOrEqual(DEPOSIT_AMOUNT);

    const recipientPrivateBalanceAfter = await getPrivateBalanceForToken(
      recipientWallet,
      SOLANA_MAINNET_USDC_ADDRESS,
      recipientAuthFields,
    );
    expect(recipientPrivateBalanceAfter - recipientPrivateBalanceBefore).toEqual(DEPOSIT_AMOUNT);
  });
});
