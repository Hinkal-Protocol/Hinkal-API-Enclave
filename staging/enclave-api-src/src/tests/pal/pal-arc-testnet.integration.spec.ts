import { ethers } from 'ethers';
import {
  ARC_TESTNET_USDC_ADDRESS,
  caseInsensitiveEqual,
  chainIds,
  ENCLAVE_API_URL,
  getPublicBalanceByTokenAddress,
  networkRegistry,
  ScheduledTransactionStatus,
  WaasHttpClient,
  waitLittle,
} from '@hinkal/common';
import { requireEnv } from '@hinkal/common/functions/utils/requireEnv';
import {
  DEFAULT_POLL_INTERVAL_MS,
  DEFAULT_POLL_TIMEOUT_MS,
  DepositAndWithdrawStatusSnapshot,
  pollDepositAndWithdrawUntilComplete,
} from '../utils/pollDepositAndWithdrawStatus';

const CHAIN_ID = chainIds.arcTestnet;
const PAL_AMOUNT = '0.1';
const RECIPIENT_ADDRESS = '0xcabe6A386cd164C961Bfdc496b3731Ae1f30123C';

interface TokenInfo {
  assetId: string;
  symbol: string;
  decimals: number;
}

interface QuoteData {
  amountIn: string;
  amountOut: string;
  fee: string;
  duration: number;
}

interface OrderData {
  trackingId: string;
  approvalAddress: string | null;
  serializedTx: string;
  amountIn: string;
  amountOut: string;
  fee: string;
  expiration: string;
  eta: number;
  sourceSymbol: string;
  destinationSymbol: string;
}

type StatusData = DepositAndWithdrawStatusSnapshot;

const broadcastDeposit = async (
  serializedTxBase64: string,
  wallet: ethers.Wallet,
  provider: ethers.JsonRpcProvider,
): Promise<string> => {
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

const pollStatusUntilComplete = (client: WaasHttpClient, trackingId: string) =>
  pollDepositAndWithdrawUntilComplete(() => client.getJson<StatusData>(`/pal/status/${trackingId}`), {
    label: trackingId,
    timeoutMs: DEFAULT_POLL_TIMEOUT_MS,
    intervalMs: DEFAULT_POLL_INTERVAL_MS,
  });

const pollBalanceUntil = async (address: string, tokenAddress: string, expected: bigint): Promise<bigint> => {
  const deadline = Date.now() + DEFAULT_POLL_TIMEOUT_MS;
  while (Date.now() < deadline) {
    // eslint-disable-next-line no-await-in-loop
    const balance = (await getPublicBalanceByTokenAddress(CHAIN_ID, address, tokenAddress)) ?? 0n;
    if (balance === expected) return balance;
    // eslint-disable-next-line no-await-in-loop
    await waitLittle(DEFAULT_POLL_INTERVAL_MS);
  }
  return (await getPublicBalanceByTokenAddress(CHAIN_ID, address, tokenAddress)) ?? 0n;
};

describe('PAL Arc testnet E2E (EVM)', () => {
  jest.setTimeout(600_000);

  let client: WaasHttpClient;
  let wallet: ethers.Wallet;
  let provider: ethers.JsonRpcProvider;

  beforeAll(() => {
    const apiKey = requireEnv('ENCLAVE_TESTING_PAL_API_KEY').trim();
    const rpcUrl = networkRegistry[CHAIN_ID].fetchRpcUrl;
    if (!rpcUrl) throw new Error(`No fetchRpcUrl for chain ${CHAIN_ID}`);

    client = new WaasHttpClient(ENCLAVE_API_URL, apiKey);
    provider = new ethers.JsonRpcProvider(rpcUrl);
    wallet = new ethers.Wallet(requireEnv('ENCLAVE_TESTING_PRIVATE_KEY').trim(), provider);
  });

  it('GET /pal/tokens returns USDC', async () => {
    const data = await client.getJson<{ tokens: TokenInfo[] }>('/pal/tokens', { chainId: String(CHAIN_ID) });
    expect(Array.isArray(data.tokens)).toBe(true);
    const usdc = data.tokens.find((t) => caseInsensitiveEqual(t.assetId, ARC_TESTNET_USDC_ADDRESS));
    expect(usdc).toBeDefined();
    expect(usdc?.decimals).toBe(6);
  });

  it('POST /pal/quote returns valid fee math', async () => {
    const data = await client.postJson<QuoteData>('/pal/quote', {
      chainId: CHAIN_ID,
      sourceAssetId: ARC_TESTNET_USDC_ADDRESS,
      amount: PAL_AMOUNT,
      recipientAddress: RECIPIENT_ADDRESS,
    });
    expect(data.amountIn).toBeDefined();
    expect(data.amountOut).toBeDefined();
    expect(data.fee).toBeDefined();
    expect(BigInt(data.amountIn) > BigInt(data.amountOut)).toBe(true);
    expect(BigInt(data.amountIn).toString()).toBe((BigInt(data.amountOut) + BigInt(data.fee)).toString());
    expect(data.duration).toBeGreaterThan(0);
  });

  it('POST /pal/order → approve → broadcast → poll until scheduled txs complete', async () => {
    const recipientBefore =
      (await getPublicBalanceByTokenAddress(CHAIN_ID, RECIPIENT_ADDRESS, ARC_TESTNET_USDC_ADDRESS)) ?? 0n;

    const order = await client.postJson<OrderData>('/pal/order', {
      chainId: CHAIN_ID,
      sourceAssetId: ARC_TESTNET_USDC_ADDRESS,
      amount: PAL_AMOUNT,
      senderAddress: wallet.address,
      recipientAddress: RECIPIENT_ADDRESS,
    });

    expect(order.trackingId).toBeDefined();
    expect(order.serializedTx).toBeDefined();
    expect(BigInt(order.amountIn).toString()).toBe((BigInt(order.amountOut) + BigInt(order.fee)).toString());

    if (order.approvalAddress) {
      const erc20 = new ethers.Contract(
        ARC_TESTNET_USDC_ADDRESS,
        ['function approve(address spender, uint256 amount) returns (bool)'],
        wallet,
      );
      const approveTx = await erc20['approve'](order.approvalAddress, BigInt(order.amountIn));
      await approveTx.wait();
    }

    const depositHash = await broadcastDeposit(order.serializedTx, wallet, provider);
    expect(depositHash).toMatch(/^0x[0-9a-fA-F]{64}$/);

    const finalStatus = await pollStatusUntilComplete(client, order.trackingId);
    expect(finalStatus.status).toBe('scheduled');
    expect(finalStatus.scheduledTransactions?.every((tx) => tx.status === ScheduledTransactionStatus.COMPLETED)).toBe(
      true,
    );

    const expectedBalance = recipientBefore + BigInt(order.amountOut);
    const recipientAfter = await pollBalanceUntil(RECIPIENT_ADDRESS, ARC_TESTNET_USDC_ADDRESS, expectedBalance);
    expect(recipientAfter.toString()).toBe(expectedBalance.toString());
  });
});
