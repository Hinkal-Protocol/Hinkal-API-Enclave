import { ethers } from 'ethers';
import {
  chainIds,
  ENCLAVE_API_URL,
  getAmountInWei,
  HINKAL_SWAP_VARIABLE_RATE,
  httpClient,
  waitForEthereumTransactionConfirmation,
} from '@hinkal/common';
import { createJsonRpcProvider } from '@hinkal/common/functions/utils/create-provider';
import { requireEnv } from '@hinkal/common/functions/utils/requireEnv';
import { depositUsdcToPrivate } from '../utils/enclaveIntegrationHelpers';
import { buildAuthPost, buildSwapAuthFields, createEnclaveSession } from '../utils/enclaveAuthHelper';
import { fetchFeeStructure } from '../utils/fetchFeeStructure';
import { fetchSwapData } from '../utils/fetchSwapData';
import { getPrivateBalanceForToken } from '../utils/getPrivateBalance';
import { TxHashResponse } from '../../types';
import { getERC20Token } from '@hinkal/erc20-registry';

const CHAIN_ID = chainIds.optimism; // arc testnet does not support swaps, that is why we use optimism
const OPTIMISM_USDC_ADDRESS = '0x0b2C639c533813f4Aa9D7837CAf62653d097Ff85';
const OPTIMISM_USDT_ADDRESS = '0x94b008aa00579c1307b0ef2c499ad98a8ce58e58';
const DEPOSIT_AMOUNT = BigInt('10000'); // 0.01 USDC (6 decimals)
const SWAP_INPUT_AMOUNT = '0.001'; // 0.001 USDC

let wallet: ethers.Wallet;

beforeAll(() => {
  const privateKey = requireEnv('ENCLAVE_TESTING_PRIVATE_KEY');
  const provider = createJsonRpcProvider(CHAIN_ID);
  wallet = new ethers.Wallet(privateKey, provider);
});

// skip because it's written for optimism and arc testnet does not support swaps
describe('swap routes', () => {
  jest.setTimeout(300_000);

  it('get-swap-data returns the best quote for a USDC to EURC pair', async () => {
    const authFields = await createEnclaveSession(wallet);
    const { swapData, externalActionId, outSwapAmount } = await fetchSwapData(
      wallet,
      CHAIN_ID,
      OPTIMISM_USDC_ADDRESS,
      OPTIMISM_USDT_ADDRESS,
      SWAP_INPUT_AMOUNT,
      authFields,
    );

    expect(swapData).toBeTruthy();
    expect(externalActionId).toBeTruthy();
    expect(BigInt(outSwapAmount)).toBeGreaterThan(0n);
  });

  it('returns tx hash and updates private balances after swapping USDC to EURC', async () => {
    const authFields = await createEnclaveSession(wallet);

    await depositUsdcToPrivate(wallet, CHAIN_ID, DEPOSIT_AMOUNT, authFields, OPTIMISM_USDC_ADDRESS, false);

    const inSwapToken = getERC20Token(OPTIMISM_USDC_ADDRESS, CHAIN_ID);
    const outSwapToken = getERC20Token(OPTIMISM_USDT_ADDRESS, CHAIN_ID);
    if (!inSwapToken || !outSwapToken) throw new Error('Swap tokens not found on arc testnet');

    const privateUsdcBefore = await getPrivateBalanceForToken(wallet, CHAIN_ID, OPTIMISM_USDC_ADDRESS, authFields);
    const privateUsdtBefore = await getPrivateBalanceForToken(wallet, CHAIN_ID, OPTIMISM_USDT_ADDRESS, authFields);

    const {
      swapData,
      externalActionId,
      outSwapAmount: quotedOutSwapAmount,
    } = await fetchSwapData(
      wallet,
      CHAIN_ID,
      OPTIMISM_USDC_ADDRESS,
      OPTIMISM_USDT_ADDRESS,
      SWAP_INPUT_AMOUNT,
      authFields,
    );

    const inSwapAmountWei = getAmountInWei(inSwapToken, SWAP_INPUT_AMOUNT);
    const outSwapAmount = (BigInt(quotedOutSwapAmount) * (10000n - HINKAL_SWAP_VARIABLE_RATE)) / 10000n;

    const feeStructure = await fetchFeeStructure(
      wallet,
      CHAIN_ID,
      OPTIMISM_USDC_ADDRESS,
      [OPTIMISM_USDC_ADDRESS, OPTIMISM_USDT_ADDRESS],
      externalActionId,
      authFields,
      HINKAL_SWAP_VARIABLE_RATE,
    );

    const txData = {
      chainId: CHAIN_ID,
      tokenAddresses: [OPTIMISM_USDC_ADDRESS, OPTIMISM_USDT_ADDRESS],
      amounts: [(-inSwapAmountWei).toString(), outSwapAmount.toString()],
      externalActionId,
      swapData,
      feeToken: OPTIMISM_USDC_ADDRESS,
      feeStructure,
    };

    const { body, headers } = await buildAuthPost(authFields, CHAIN_ID, '/swap', txData, () =>
      buildSwapAuthFields(authFields, wallet, txData),
    );

    const response = await httpClient.post<TxHashResponse>(
      `${ENCLAVE_API_URL}/swap`,
      body,
      headers ? { headers } : undefined,
    );

    const { txHash } = response as Extract<TxHashResponse, { success: true }>;

    expect(txHash).toBeDefined();

    await waitForEthereumTransactionConfirmation(CHAIN_ID, txHash);

    const privateUsdcAfter = await getPrivateBalanceForToken(wallet, CHAIN_ID, OPTIMISM_USDC_ADDRESS, authFields);
    const privateUsdtAfter = await getPrivateBalanceForToken(wallet, CHAIN_ID, OPTIMISM_USDT_ADDRESS, authFields);

    expect(privateUsdtAfter - privateUsdtBefore).toBeGreaterThanOrEqual(0n);
    expect(privateUsdcBefore - privateUsdcAfter).toEqual(inSwapAmountWei + BigInt(feeStructure.flatFee));
  });
});
