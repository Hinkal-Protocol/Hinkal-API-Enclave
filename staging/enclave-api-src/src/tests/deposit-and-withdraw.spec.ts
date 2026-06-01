import axios from 'axios';
import { ethers } from 'ethers';
import {
  ARC_TESTNET_USDC_ADDRESS,
  chainIds,
  ENCLAVE_API_URL,
  ERC20ABI,
  getPublicBalanceByTokenAddress,
  httpClient,
  ScheduledTransactionStatus,
  waitLittle,
} from '@hinkal/common';
import { createJsonRpcProvider } from '@hinkal/common/functions/utils/create-provider';
import { requireEnv } from '@hinkal/common/functions/utils/requireEnv';
import { prepareDepositAndWithdraw } from './utils/enclaveIntegrationHelpers';
import { DepositAndWithdrawPublicStatus } from '../utils/resolveDepositAndWithdrawPublicStatus';
import {
  DEFAULT_POLL_INTERVAL_MS,
  DEFAULT_POLL_TIMEOUT_MS,
  DepositAndWithdrawStatusSnapshot,
  pollDepositAndWithdrawUntilComplete,
} from './utils/pollDepositAndWithdrawStatus';

const CHAIN_ID = chainIds.arcTestnet;
const RECIPIENT_ADDRESS = '0x742d35Cc6634C0532925a3b844Bc454e4438f44e';

interface OrderStatusResponse extends DepositAndWithdrawStatusSnapshot {
  success: boolean;
}

let wallet: ethers.Wallet;
let provider: ethers.JsonRpcProvider;

beforeAll(() => {
  provider = createJsonRpcProvider(CHAIN_ID);
  wallet = new ethers.Wallet(requireEnv('ENCLAVE_TESTING_PRIVATE_KEY'), provider);
});

const broadcastDeposit = async (serializedTxBase64: string): Promise<string> => {
  const rlpHex = `0x${Buffer.from(serializedTxBase64, 'base64').toString('hex')}`;
  const tx = ethers.Transaction.from(rlpHex);
  tx.chainId = BigInt(CHAIN_ID);
  tx.nonce = await provider.getTransactionCount(wallet.address, 'pending');
  tx.gasLimit = 2_000_000n;
  const feeData = await provider.getFeeData();
  tx.maxFeePerGas = feeData.maxFeePerGas;
  tx.maxPriorityFeePerGas = feeData.maxPriorityFeePerGas ?? 0n;
  const signed = await wallet.signTransaction(tx);
  const hash = await provider.send('eth_sendRawTransaction', [signed]);

  const receipt = await provider.waitForTransaction(hash, 1, 60_000);
  if (receipt?.status === 0) throw new Error(`Deposit tx ${hash} reverted on-chain`);

  return hash;
};

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

const pollOrderUntilComplete = (orderId: string) =>
  pollDepositAndWithdrawUntilComplete(() => fetchOrderStatus(orderId), {
    label: orderId,
    timeoutMs: DEFAULT_POLL_TIMEOUT_MS,
    intervalMs: DEFAULT_POLL_INTERVAL_MS,
  });

const getUsdcBalance = (address: string): Promise<bigint> =>
  getPublicBalanceByTokenAddress(CHAIN_ID, address, ARC_TESTNET_USDC_ADDRESS).then((b) => b ?? 0n);

const pollBalanceUntil = async (address: string, expected: bigint): Promise<bigint> => {
  const deadline = Date.now() + DEFAULT_POLL_TIMEOUT_MS;
  while (Date.now() < deadline) {
    // eslint-disable-next-line no-await-in-loop
    const balance = await getUsdcBalance(address);
    if (balance === expected) return balance;
    // eslint-disable-next-line no-await-in-loop
    await waitLittle(DEFAULT_POLL_INTERVAL_MS);
  }
  return getUsdcBalance(address);
};

describe('deposit-and-withdraw route', () => {
  jest.setTimeout(600_000);

  it('single recipient: prepares order, broadcasts deposit, polls until scheduled txs complete, recipient receives USDC', async () => {
    const DEPOSIT_AMOUNT = BigInt('300000'); // 0.3 USDC

    const recipientBefore = await getUsdcBalance(RECIPIENT_ADDRESS);

    const order = await prepareDepositAndWithdraw(wallet, CHAIN_ID, [
      { address: RECIPIENT_ADDRESS, amount: DEPOSIT_AMOUNT },
    ]);

    expect(order.orderId).toBeDefined();
    expect(order.serializedTx).toBeDefined();
    expect(BigInt(order.amountIn).toString()).toBe((BigInt(order.amountOut) + BigInt(order.fee)).toString());

    if (order.approvalAddress) {
      const usdc = new ethers.Contract(ARC_TESTNET_USDC_ADDRESS, ERC20ABI, wallet);
      const approveTx = await usdc['approve'](order.approvalAddress, BigInt(order.amountIn));
      await approveTx.wait();
    }

    const depositHash = await broadcastDeposit(order.serializedTx);
    expect(depositHash).toMatch(/^0x[0-9a-fA-F]{64}$/);

    const finalStatus = await pollOrderUntilComplete(order.orderId);
    expect(finalStatus.status).toBe(DepositAndWithdrawPublicStatus.Scheduled);
    expect(finalStatus.scheduledTransactions?.every((tx) => tx.status === ScheduledTransactionStatus.COMPLETED)).toBe(
      true,
    );

    const expectedBalance = recipientBefore + BigInt(order.amountOut);
    const recipientAfter = await pollBalanceUntil(RECIPIENT_ADDRESS, expectedBalance);
    expect(recipientAfter.toString()).toBe(expectedBalance.toString());
  });

  it('multiple recipients: each recipient receives correct USDC amount', async () => {
    const AMOUNT_1 = BigInt('200000'); // 0.2 USDC
    const AMOUNT_2 = BigInt('100000'); // 0.1 USDC

    const recipient2 = ethers.Wallet.createRandom();

    const [recipient1Before, recipient2Before] = await Promise.all([
      getUsdcBalance(RECIPIENT_ADDRESS),
      getUsdcBalance(recipient2.address),
    ]);

    const order = await prepareDepositAndWithdraw(wallet, CHAIN_ID, [
      { address: RECIPIENT_ADDRESS, amount: AMOUNT_1 },
      { address: recipient2.address, amount: AMOUNT_2 },
    ]);

    expect(order.orderId).toBeDefined();
    expect(order.serializedTx).toBeDefined();
    expect(BigInt(order.amountIn).toString()).toBe((BigInt(order.amountOut) + BigInt(order.fee)).toString());

    if (order.approvalAddress) {
      const usdc = new ethers.Contract(ARC_TESTNET_USDC_ADDRESS, ERC20ABI, wallet);
      const approveTx = await usdc['approve'](order.approvalAddress, BigInt(order.amountIn));
      await approveTx.wait();
    }

    await broadcastDeposit(order.serializedTx);

    const finalStatus = await pollOrderUntilComplete(order.orderId);
    expect(finalStatus.status).toBe(DepositAndWithdrawPublicStatus.Scheduled);
    expect(finalStatus.scheduledTransactions?.every((tx) => tx.status === ScheduledTransactionStatus.COMPLETED)).toBe(
      true,
    );

    const [recipient1After, recipient2After] = await Promise.all([
      pollBalanceUntil(RECIPIENT_ADDRESS, recipient1Before + AMOUNT_1),
      pollBalanceUntil(recipient2.address, recipient2Before + AMOUNT_2),
    ]);

    expect(recipient1After).toBe(recipient1Before + AMOUNT_1);
    expect(recipient2After).toBe(recipient2Before + AMOUNT_2);
  });
});
