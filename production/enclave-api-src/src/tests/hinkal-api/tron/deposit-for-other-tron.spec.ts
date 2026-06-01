import { createEnclaveTronSession } from '../../utils/enclaveTronAuthHelper';
import { depositForOtherUsdt, getRecipientInfo, getTronUsdtBalance } from '../../utils/tronIntegrationHelpers';
import { getPrivateBalanceForToken } from '../../utils/getPrivateBalanceTron';
import { TRON_NILE_CHAIN_ID, TRON_NILE_USDT_ADDRESS } from '../../utils/tronTestConstants';
import {
  getEnclaveTronRecipientTestWallet,
  getEnclaveTronTestWallet,
  type TronTestWallet,
} from '../../utils/tronTestWallet';

const DEPOSIT_AMOUNT = BigInt('100000'); // 0.1 USDT (6 decimals)

let senderWallet: TronTestWallet;
let recipientWallet: TronTestWallet;

beforeAll(() => {
  senderWallet = getEnclaveTronTestWallet();
  recipientWallet = getEnclaveTronRecipientTestWallet();
});

describe('deposit-for-other route (Tron Nile)', () => {
  jest.setTimeout(300_000);

  it('returns tx calldata, approves, broadcasts, and increases recipient private balance by deposit amount', async () => {
    const recipientAuthFields = await createEnclaveTronSession(recipientWallet, TRON_NILE_CHAIN_ID);
    const recipientInfo = await getRecipientInfo(recipientWallet, recipientAuthFields);

    const senderBalanceBefore = await getTronUsdtBalance(senderWallet);
    const recipientPrivateBalanceBefore = await getPrivateBalanceForToken(
      recipientWallet,
      TRON_NILE_USDT_ADDRESS,
      recipientAuthFields,
    );

    await depositForOtherUsdt(senderWallet, DEPOSIT_AMOUNT, recipientInfo);

    const senderBalanceAfter = await getTronUsdtBalance(senderWallet);
    expect(senderBalanceBefore - senderBalanceAfter).toBeGreaterThanOrEqual(DEPOSIT_AMOUNT);

    const recipientPrivateBalanceAfter = await getPrivateBalanceForToken(
      recipientWallet,
      TRON_NILE_USDT_ADDRESS,
      recipientAuthFields,
    );
    expect(recipientPrivateBalanceAfter - recipientPrivateBalanceBefore).toEqual(DEPOSIT_AMOUNT);
  });
});
