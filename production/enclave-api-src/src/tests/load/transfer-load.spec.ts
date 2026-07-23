import {
  ARC_TESTNET_USDC_ADDRESS,
  chainIds,
  ENCLAVE_API_URL,
  httpClient,
  RecipientInfoResponse,
  sessionQueryParams,
} from '@hinkal/common';
import { ethers } from 'ethers';
import { createJsonRpcProvider } from '@hinkal/common/functions/utils/create-provider';
import { requireEnv } from '@hinkal/common/functions/utils/requireEnv';
import { createEnclaveSession, requestSignatureGetHeader } from '../utils/enclaveAuthHelper';
import { depositUsdcToPrivate, transferUsdc } from '../utils/enclaveIntegrationHelpers';
import { getPrivateBalanceForToken } from '../utils/getPrivateBalance';
import { fundWalletsWithUsdc } from '../utils/loadTestHelpers';

const CHAIN_ID = chainIds.arcTestnet;
const CONCURRENT_COUNT = 10;
const DEPOSIT_AMOUNT = BigInt('200000'); // 0.2 USDC
const TRANSFER_AMOUNT = BigInt('50000'); // 0.05 USDC
const TOPUP_USDC = BigInt('300000'); // 0.3 USDC per wallet

let funder: ethers.Wallet;
let testWallets: ethers.HDNodeWallet[];
let provider: ethers.JsonRpcProvider;
let funderRecipientInfo: string;

beforeAll(async () => {
  provider = createJsonRpcProvider(CHAIN_ID);
  funder = new ethers.Wallet(requireEnv('ENCLAVE_TESTING_PRIVATE_KEY'), provider);
  testWallets = Array.from({ length: CONCURRENT_COUNT }, () => ethers.Wallet.createRandom().connect(provider));

  const funderAuthFields = await createEnclaveSession(funder);
  const recipientParams = new URLSearchParams(sessionQueryParams(funderAuthFields, CHAIN_ID));
  const recipientQueryString = recipientParams.toString();
  const recipientInfoResponse = await httpClient.get<RecipientInfoResponse>(
    `${ENCLAVE_API_URL}/recipient-info?${recipientQueryString}`,
    { headers: requestSignatureGetHeader(funderAuthFields, '/recipient-info', recipientQueryString) },
  );
  funderRecipientInfo = (recipientInfoResponse as Extract<RecipientInfoResponse, { success: true }>).recipientInfo;

  await fundWalletsWithUsdc(funder, testWallets, TOPUP_USDC, provider);

  await Promise.all(
    testWallets.map(async (wallet) => {
      const authFields = await createEnclaveSession(wallet);
      await depositUsdcToPrivate(wallet, CHAIN_ID, DEPOSIT_AMOUNT, authFields);
    }),
  );
});

describe(`transfer load test (${CONCURRENT_COUNT} concurrent wallets)`, () => {
  jest.setTimeout(20 * 60_000);

  it(`runs ${CONCURRENT_COUNT} concurrent transfers to funder, all confirm on-chain`, async () => {
    const funderAuthFieldsBefore = await createEnclaveSession(funder);
    const [privateBalancesBefore, funderPrivateBefore] = await Promise.all([
      Promise.all(
        testWallets.map(async (wallet) => {
          const authFields = await createEnclaveSession(wallet);
          return getPrivateBalanceForToken(wallet, CHAIN_ID, ARC_TESTNET_USDC_ADDRESS, authFields);
        }),
      ),
      getPrivateBalanceForToken(funder, CHAIN_ID, ARC_TESTNET_USDC_ADDRESS, funderAuthFieldsBefore),
    ]);

    const txHashes = await Promise.all(
      testWallets.map(async (wallet) => {
        const authFields = await createEnclaveSession(wallet);
        return transferUsdc(wallet, CHAIN_ID, TRANSFER_AMOUNT, funderRecipientInfo, authFields);
      }),
    );

    const funderAuthFieldsAfter = await createEnclaveSession(funder);
    const [privateBalancesAfter, funderPrivateAfter] = await Promise.all([
      Promise.all(
        testWallets.map(async (wallet) => {
          const authFields = await createEnclaveSession(wallet);
          return getPrivateBalanceForToken(wallet, CHAIN_ID, ARC_TESTNET_USDC_ADDRESS, authFields);
        }),
      ),
      getPrivateBalanceForToken(funder, CHAIN_ID, ARC_TESTNET_USDC_ADDRESS, funderAuthFieldsAfter),
    ]);

    txHashes.forEach((txHash) => expect(txHash).toBeDefined());

    testWallets.forEach((_, i) => {
      expect(privateBalancesBefore[i] - privateBalancesAfter[i]).toBeGreaterThanOrEqual(TRANSFER_AMOUNT);
    });

    expect(funderPrivateAfter - funderPrivateBefore).toEqual(TRANSFER_AMOUNT * BigInt(CONCURRENT_COUNT));
  });
});
