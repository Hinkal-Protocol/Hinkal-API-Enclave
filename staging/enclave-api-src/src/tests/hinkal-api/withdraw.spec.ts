import { ethers } from 'ethers';
import {
  ARC_TESTNET_USDC_ADDRESS,
  chainIds,
  ENCLAVE_API_URL,
  ERC20ABI,
  ExternalActionId,
  httpClient,
  waitForEthereumTransactionConfirmation,
} from '@hinkal/common';
import { createJsonRpcProvider } from '@hinkal/common/functions/utils/create-provider';
import { requireEnv } from '@hinkal/common/functions/utils/requireEnv';
import { depositUsdcToPrivate } from '../utils/enclaveIntegrationHelpers';
import { TxHashResponse } from '../../types';
import { buildAuthPost, buildWithdrawAuthFields, createEnclaveSession } from '../utils/enclaveAuthHelper';
import { fetchFeeStructure } from '../utils/fetchFeeStructure';
import { getPrivateBalanceForToken } from '../utils/getPrivateBalance';

const CHAIN_ID = chainIds.arcTestnet;
const DEPOSIT_AMOUNT = BigInt('100000'); // 0.1 USDC (6 decimals)
const WITHDRAW_AMOUNT = BigInt('10000'); // 0.05 USDC (6 decimals)

let wallet: ethers.Wallet;
let usdc: ethers.Contract;

beforeAll(() => {
  const privateKey = requireEnv('ENCLAVE_TESTING_PRIVATE_KEY');
  const provider = createJsonRpcProvider(CHAIN_ID);
  wallet = new ethers.Wallet(privateKey, provider);

  usdc = new ethers.Contract(ARC_TESTNET_USDC_ADDRESS, ERC20ABI, wallet);
});

const getUsdcBalance = (): Promise<bigint> => usdc.balanceOf(wallet.address);

describe('withdraw route', () => {
  jest.setTimeout(300_000);

  it('returns tx hash and increases public USDC balance after withdrawing from private balance', async () => {
    const authFields = await createEnclaveSession(wallet);

    await depositUsdcToPrivate(wallet, CHAIN_ID, DEPOSIT_AMOUNT, authFields);

    const balanceBeforeWithdraw: bigint = await getUsdcBalance();
    const privateBalanceBeforeWithdraw = await getPrivateBalanceForToken(
      wallet,
      CHAIN_ID,
      ARC_TESTNET_USDC_ADDRESS,
      authFields,
    );

    const feeStructure = await fetchFeeStructure(
      wallet,
      CHAIN_ID,
      ARC_TESTNET_USDC_ADDRESS,
      [ARC_TESTNET_USDC_ADDRESS],
      ExternalActionId.Transact,
      authFields,
    );

    const txParams = {
      chainId: CHAIN_ID,
      tokenAddresses: [ARC_TESTNET_USDC_ADDRESS],
      amounts: [WITHDRAW_AMOUNT.toString()],
      recipientAddress: wallet.address,
    };
    const authParams = {
      ...txParams,
      feeToken: ARC_TESTNET_USDC_ADDRESS,
      feeStructure,
    };
    const { body, headers } = await buildAuthPost(authFields, CHAIN_ID, authParams, () =>
      buildWithdrawAuthFields(authFields, wallet, authParams),
    );
    const response = await httpClient.post<TxHashResponse>(
      `${ENCLAVE_API_URL}/withdraw`,
      body,
      headers ? { headers } : undefined,
    );

    const { txHash } = response as Extract<TxHashResponse, { success: true }>;

    expect(txHash).toBeDefined();

    await waitForEthereumTransactionConfirmation(CHAIN_ID, txHash);

    const balanceAfterWithdraw: bigint = await getUsdcBalance();
    const privateBalanceAfterWithdraw = await getPrivateBalanceForToken(
      wallet,
      CHAIN_ID,
      ARC_TESTNET_USDC_ADDRESS,
      authFields,
    );

    expect(balanceAfterWithdraw - balanceBeforeWithdraw).toBeGreaterThan(0n);
    expect(privateBalanceAfterWithdraw - privateBalanceBeforeWithdraw).toEqual(
      -WITHDRAW_AMOUNT - BigInt(feeStructure.flatFee),
    );
  });
});
