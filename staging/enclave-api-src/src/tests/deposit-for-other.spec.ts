import { ethers } from 'ethers';
import { ARC_TESTNET_USDC_ADDRESS, chainIds, ERC20ABI } from '@hinkal/common';
import { createJsonRpcProvider } from '@hinkal/common/functions/utils/create-provider';
import { requireEnv } from '@hinkal/common/functions/utils/requireEnv';
import { createEnclaveSession } from './utils/enclaveAuthHelper';
import { depositForOtherUsdc, getRecipientInfo } from './utils/enclaveIntegrationHelpers';
import { getPrivateBalanceForToken } from './utils/getPrivateBalance';

const CHAIN_ID = chainIds.arcTestnet;
const DEPOSIT_AMOUNT = BigInt('100000'); // 0.1 USDC (6 decimals)

let senderWallet: ethers.Wallet;
let recipientWallet: ethers.Wallet;
let usdc: ethers.Contract;

beforeAll(() => {
  const provider = createJsonRpcProvider(CHAIN_ID);
  senderWallet = new ethers.Wallet(requireEnv('ENCLAVE_TESTING_PRIVATE_KEY'), provider);
  recipientWallet = new ethers.Wallet(requireEnv('ENCLAVE_TESTING_RECIPIENT_PRIVATE_KEY'), provider);

  usdc = new ethers.Contract(ARC_TESTNET_USDC_ADDRESS, ERC20ABI, senderWallet);
});

const getSenderUsdcBalance = (): Promise<bigint> => usdc.balanceOf(senderWallet.address);

describe('deposit-for-other route', () => {
  jest.setTimeout(300_000);

  it('returns tx calldata, approves, broadcasts, and increases recipient private balance by deposit amount', async () => {
    const recipientAuthFields = await createEnclaveSession(recipientWallet, CHAIN_ID);
    const recipientInfo = await getRecipientInfo(recipientWallet, CHAIN_ID, recipientAuthFields);

    const senderBalanceBefore: bigint = await getSenderUsdcBalance();
    const recipientPrivateBalanceBefore = await getPrivateBalanceForToken(
      recipientWallet,
      CHAIN_ID,
      ARC_TESTNET_USDC_ADDRESS,
      recipientAuthFields,
    );

    await depositForOtherUsdc(senderWallet, CHAIN_ID, DEPOSIT_AMOUNT, recipientInfo);

    const senderBalanceAfter: bigint = await getSenderUsdcBalance();
    expect(senderBalanceBefore - senderBalanceAfter).toBeGreaterThanOrEqual(DEPOSIT_AMOUNT);

    const recipientPrivateBalanceAfter = await getPrivateBalanceForToken(
      recipientWallet,
      CHAIN_ID,
      ARC_TESTNET_USDC_ADDRESS,
      recipientAuthFields,
    );
    expect(recipientPrivateBalanceAfter - recipientPrivateBalanceBefore).toEqual(DEPOSIT_AMOUNT);
  });
});
