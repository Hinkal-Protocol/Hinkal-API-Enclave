import { ethers } from 'ethers';
import { ARC_TESTNET_USDC_ADDRESS, chainIds, ERC20ABI } from '@hinkal/common';
import { createJsonRpcProvider } from '@hinkal/common/functions/utils/create-provider';
import { requireEnv } from '@hinkal/common/functions/utils/requireEnv';
import { createEnclaveSession } from '../utils/enclaveAuthHelper';
import { depositUsdcToPrivate } from '../utils/enclaveIntegrationHelpers';
import { getPrivateBalanceForToken } from '../utils/getPrivateBalance';

const CHAIN_ID = chainIds.arcTestnet;
const DEPOSIT_AMOUNT = BigInt('100000'); // 0.1 USDC (6 decimals)

let wallet: ethers.Wallet;
let usdc: ethers.Contract;

beforeAll(() => {
  const privateKey = requireEnv('ENCLAVE_TESTING_PRIVATE_KEY');
  const provider = createJsonRpcProvider(CHAIN_ID);
  wallet = new ethers.Wallet(privateKey, provider);

  usdc = new ethers.Contract(ARC_TESTNET_USDC_ADDRESS, ERC20ABI, wallet);
});

const getUsdcBalance = (): Promise<bigint> => usdc.balanceOf(wallet.address);

describe('deposit route', () => {
  jest.setTimeout(300_000);

  it('returns tx calldata, approves, broadcasts, and decreases public USDC balance by deposit amount', async () => {
    const authFields = await createEnclaveSession(wallet, CHAIN_ID);
    const balanceBefore: bigint = await getUsdcBalance();
    const privateBalanceBefore = await getPrivateBalanceForToken(
      wallet,
      CHAIN_ID,
      ARC_TESTNET_USDC_ADDRESS,
      authFields,
    );

    await depositUsdcToPrivate(wallet, CHAIN_ID, DEPOSIT_AMOUNT);

    const balanceAfter: bigint = await getUsdcBalance();
    expect(balanceBefore - balanceAfter).toBeGreaterThanOrEqual(DEPOSIT_AMOUNT);

    const privateBalanceAfter = await getPrivateBalanceForToken(wallet, CHAIN_ID, ARC_TESTNET_USDC_ADDRESS, authFields);
    expect(privateBalanceAfter - privateBalanceBefore).toEqual(DEPOSIT_AMOUNT);
  });
});
