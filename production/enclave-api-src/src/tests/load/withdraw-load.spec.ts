import { ethers } from 'ethers';
import { ARC_TESTNET_USDC_ADDRESS, chainIds, ERC20ABI } from '@hinkal/common';
import { createJsonRpcProvider } from '@hinkal/common/functions/utils/create-provider';
import { requireEnv } from '@hinkal/common/functions/utils/requireEnv';
import { createEnclaveSession } from '../utils/enclaveAuthHelper';
import { depositUsdcToPrivate, withdrawUsdc } from '../utils/enclaveIntegrationHelpers';
import { getPrivateBalanceForToken } from '../utils/getPrivateBalance';
import { fundWalletsWithUsdc } from '../utils/loadTestHelpers';

const CHAIN_ID = chainIds.arcTestnet;
const CONCURRENT_COUNT = 10;
const DEPOSIT_AMOUNT = BigInt('200000'); // 0.2 USDC
const WITHDRAW_AMOUNT = BigInt('100000'); // 0.1 USDC
const TOPUP_USDC = BigInt('300000'); // 0.3 USDC per wallet

let funder: ethers.Wallet;
let testWallets: ethers.HDNodeWallet[];
let provider: ethers.JsonRpcProvider;

beforeAll(async () => {
  provider = createJsonRpcProvider(CHAIN_ID);
  funder = new ethers.Wallet(requireEnv('ENCLAVE_TESTING_PRIVATE_KEY'), provider);
  testWallets = Array.from({ length: CONCURRENT_COUNT }, () => ethers.Wallet.createRandom().connect(provider));

  await fundWalletsWithUsdc(funder, testWallets, TOPUP_USDC, provider);

  await Promise.all(
    testWallets.map(async (wallet) => {
      await depositUsdcToPrivate(wallet, CHAIN_ID, DEPOSIT_AMOUNT, ARC_TESTNET_USDC_ADDRESS);
    }),
  );
});

const getUsdcBalance = (wallet: ethers.Wallet): Promise<bigint> =>
  new ethers.Contract(ARC_TESTNET_USDC_ADDRESS, ERC20ABI, wallet).balanceOf(wallet.address);

describe(`withdraw load test (${CONCURRENT_COUNT} concurrent wallets)`, () => {
  jest.setTimeout(20 * 60_000);

  it(`runs ${CONCURRENT_COUNT} concurrent withdraws, all confirm on-chain`, async () => {
    const [privateBalancesBefore, funderUsdcBefore] = await Promise.all([
      Promise.all(
        testWallets.map(async (wallet) => {
          const authFields = await createEnclaveSession(wallet);
          return getPrivateBalanceForToken(wallet, CHAIN_ID, ARC_TESTNET_USDC_ADDRESS, authFields);
        }),
      ),
      getUsdcBalance(funder),
    ]);

    const txHashes = await Promise.all(
      testWallets.map(async (wallet) => {
        const authFields = await createEnclaveSession(wallet);
        return withdrawUsdc(wallet, CHAIN_ID, WITHDRAW_AMOUNT, funder.address, authFields);
      }),
    );

    const [privateBalancesAfter, funderUsdcAfter] = await Promise.all([
      Promise.all(
        testWallets.map(async (wallet) => {
          const authFields = await createEnclaveSession(wallet);
          return getPrivateBalanceForToken(wallet, CHAIN_ID, ARC_TESTNET_USDC_ADDRESS, authFields);
        }),
      ),
      getUsdcBalance(funder),
    ]);

    txHashes.forEach((txHash) => expect(txHash).toBeDefined());

    testWallets.forEach((_, i) => {
      expect(privateBalancesBefore[i] - privateBalancesAfter[i]).toBeGreaterThanOrEqual(WITHDRAW_AMOUNT);
    });

    expect(funderUsdcAfter - funderUsdcBefore).toEqual(WITHDRAW_AMOUNT * BigInt(CONCURRENT_COUNT));
  });
});
