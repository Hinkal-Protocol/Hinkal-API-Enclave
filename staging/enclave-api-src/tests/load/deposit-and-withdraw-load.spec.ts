import axios from 'axios';
import { ethers } from 'ethers';
import {
  ARC_TESTNET_USDC_ADDRESS,
  chainIds,
  ENCLAVE_API_URL,
  ERC20ABI,
  httpClient,
  ScheduledTransactionStatus,
} from '@hinkal/common';
import { createJsonRpcProvider } from '@hinkal/common/functions/utils/create-provider';
import { requireEnv } from '@hinkal/common/functions/utils/requireEnv';
import { prepareDepositAndWithdraw } from '../utils/enclaveIntegrationHelpers';
import { DepositAndWithdrawPublicStatus } from '../../utils/resolveDepositAndWithdrawPublicStatus';
import { DepositAndWithdrawResponse } from '../../types';
import { fundWalletsWithUsdc } from '../utils/loadTestHelpers';
import {
  DEFAULT_POLL_INTERVAL_MS,
  DepositAndWithdrawStatusSnapshot,
  pollDepositAndWithdrawUntilComplete,
} from '../utils/pollDepositAndWithdrawStatus';

const CHAIN_ID = chainIds.arcTestnet;
const CONCURRENT_COUNT = 10;
const DEPOSIT_AMOUNT = BigInt('150000'); // 0.15 USDC per order
const TOPUP_USDC = BigInt('300000'); // 0.3 USDC per test wallet (6 decimals)

const LOAD_POLL_TIMEOUT_MS = 10 * 60_000;

type Order = Extract<DepositAndWithdrawResponse, { success: true }>;

interface OrderStatusResponse extends DepositAndWithdrawStatusSnapshot {
  success: boolean;
}

let funder: ethers.Wallet;
let testWallets: ethers.HDNodeWallet[];
let provider: ethers.JsonRpcProvider;
let recipientAddress: string;

beforeAll(async () => {
  provider = createJsonRpcProvider(CHAIN_ID);
  funder = new ethers.Wallet(requireEnv('ENCLAVE_TESTING_PRIVATE_KEY'), provider);
  recipientAddress = funder.address;
  testWallets = Array.from({ length: CONCURRENT_COUNT }, () => ethers.Wallet.createRandom().connect(provider));

  await fundWalletsWithUsdc(funder, testWallets, TOPUP_USDC, provider);
});

const fetchOrderStatus = async (orderId: string): Promise<OrderStatusResponse> => {
  try {
    return await httpClient.get<OrderStatusResponse>(`${ENCLAVE_API_URL}/private-send/${orderId}`);
  } catch (err) {
    if (axios.isAxiosError(err)) {
      throw new Error(`GET /private-send/${orderId} → ${err.response?.status}: ${JSON.stringify(err.response?.data)}`);
    }
    throw err;
  }
};

const runOrderFlow = async (wallet: ethers.HDNodeWallet): Promise<OrderStatusResponse> => {
  const order: Order = await prepareDepositAndWithdraw(wallet, CHAIN_ID, [
    { address: recipientAddress, amount: DEPOSIT_AMOUNT },
  ]);

  if (order.approvalAddress) {
    const usdc = new ethers.Contract(ARC_TESTNET_USDC_ADDRESS, ERC20ABI, wallet);
    const approveTx: ethers.TransactionResponse = await usdc['approve'](order.approvalAddress, BigInt(order.amountIn));
    await approveTx.wait();
  }

  const rlpHex = `0x${Buffer.from(order.serializedTx, 'base64').toString('hex')}`;
  const tx = ethers.Transaction.from(rlpHex);
  tx.chainId = BigInt(CHAIN_ID);
  tx.nonce = await provider.getTransactionCount(wallet.address, 'pending');
  tx.gasLimit = 2_000_000n;
  const feeData = await provider.getFeeData();
  tx.maxFeePerGas = feeData.maxFeePerGas;
  tx.maxPriorityFeePerGas = feeData.maxPriorityFeePerGas ?? 0n;
  const signed = await wallet.signTransaction(tx);
  const depositHash: string = await provider.send('eth_sendRawTransaction', [signed]);
  const receipt = await provider.waitForTransaction(depositHash, 1, 120_000);
  if (receipt?.status === 0) throw new Error(`Deposit tx ${depositHash} reverted on-chain (wallet ${wallet.address})`);

  return pollDepositAndWithdrawUntilComplete(() => fetchOrderStatus(order.orderId), {
    label: order.orderId,
    timeoutMs: LOAD_POLL_TIMEOUT_MS,
    intervalMs: DEFAULT_POLL_INTERVAL_MS,
  });
};

describe(`deposit-and-withdraw load test (${CONCURRENT_COUNT} concurrent wallets)`, () => {
  jest.setTimeout(5_000_00); // 20 min

  it(`funds ${CONCURRENT_COUNT} wallets, runs flows concurrently, all scheduled txs complete`, async () => {
    const results = await Promise.all(testWallets.map((wallet) => runOrderFlow(wallet)));

    results.forEach((result) => {
      expect(result.status).toBe(DepositAndWithdrawPublicStatus.Scheduled);
      expect(result.scheduledTransactions?.every((tx) => tx.status === ScheduledTransactionStatus.COMPLETED)).toBe(
        true,
      );
    });
  });
});
