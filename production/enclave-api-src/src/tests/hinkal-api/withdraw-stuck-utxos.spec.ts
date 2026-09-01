import axios from 'axios';
import { ethers } from 'ethers';
import {
  addressToHexFormat,
  ARC_TESTNET_USDC_ADDRESS,
  BalanceResponse,
  chainIds,
  ENCLAVE_API_URL,
  EnclaveSessionAuthFields,
  getPublicBalanceByTokenAddress,
  httpClient,
  ScheduledTransactionStatus,
  sessionQueryParams,
  waitForTransactionConfirmation,
  waitLittle,
} from '@hinkal/common';
import { createJsonRpcProvider } from '@hinkal/common/functions/utils/create-provider';
import { requireEnv } from '@hinkal/common/functions/utils/requireEnv';
import { createEnclaveSession, requestSignatureGetHeader } from '../utils/enclaveAuthHelper';
import {
  buildAuthPostTron,
  buildWithdrawStuckUtxosAuthFieldsTron,
  createEnclaveSessionTron,
} from '../utils/enclaveAuthHelperTron';
import { getStuckUtxoBalance, withdrawStuckUtxos } from '../utils/enclaveIntegrationHelpers';
import { broadcastPalDepositTx, prepareDepositAndWithdraw } from '../utils/tronIntegrationHelpers';
import { DepositAndWithdrawPublicStatus } from '../../utils/resolveDepositAndWithdrawPublicStatus';
import {
  DEFAULT_POLL_INTERVAL_MS,
  DEFAULT_POLL_TIMEOUT_MS,
  DepositAndWithdrawStatusSnapshot,
} from '../utils/pollDepositAndWithdrawStatus';
import { TRON_NILE_CHAIN_ID, TRON_NILE_USDT_ADDRESS } from '../utils/tronTestConstants';
import { getEnclaveTronTestWallet, type TronTestWallet } from '../utils/tronTestWallet';

const CHAIN_ID = chainIds.arcTestnet;

let wallet: ethers.Wallet;

beforeAll(() => {
  const provider = createJsonRpcProvider(CHAIN_ID);
  wallet = new ethers.Wallet(requireEnv('ENCLAVE_TESTING_PRIVATE_KEY'), provider);
});

describe('GET /stuck-utxo-balance', () => {
  jest.setTimeout(60_000);

  it('returns a valid balance (zero or positive) for USDC', async () => {
    const authFields = await createEnclaveSession(wallet);
    const balance = await getStuckUtxoBalance(wallet, CHAIN_ID, ARC_TESTNET_USDC_ADDRESS, authFields);
    expect(balance >= 0n).toBe(true);
  });
});

describe('POST /withdraw-stuck-utxos', () => {
  jest.setTimeout(300_000);

  it('withdraws any stuck USDC UTXOs to recipient and verifies balance clears', async () => {
    const authFields = await createEnclaveSession(wallet);
    const stuckBefore = await getStuckUtxoBalance(wallet, CHAIN_ID, ARC_TESTNET_USDC_ADDRESS, authFields);
    const recipientAddress = wallet.address;
    const recipientPublicBefore =
      (await getPublicBalanceByTokenAddress(CHAIN_ID, recipientAddress, ARC_TESTNET_USDC_ADDRESS)) ?? 0n;

    const txHashes = await withdrawStuckUtxos(wallet, CHAIN_ID, ARC_TESTNET_USDC_ADDRESS, recipientAddress, authFields);

    expect(Array.isArray(txHashes)).toBe(true);

    if (stuckBefore === 0n) {
      expect(txHashes).toHaveLength(0);
      return;
    }

    expect(txHashes.length).toBeGreaterThan(0);
    expect(txHashes.every((h) => /^0x[0-9a-fA-F]{64}$/.test(h))).toBe(true);

    const stuckAfter = await getStuckUtxoBalance(wallet, CHAIN_ID, ARC_TESTNET_USDC_ADDRESS, authFields);
    expect(stuckAfter).toBe(0n);

    const recipientPublicAfter =
      (await getPublicBalanceByTokenAddress(CHAIN_ID, recipientAddress, ARC_TESTNET_USDC_ADDRESS)) ?? 0n;
    expect(recipientPublicAfter).toBeGreaterThan(recipientPublicBefore);
  });
});

/** Native TRX on Tron Nile (zero address, see tronNileRegistry.json). */
const TRON_NILE_TRX_ADDRESS = '0x0000000000000000000000000000000000000000';

/** 5 TRX (6 decimals). Has to cover the pay-send fee plus the stuck-withdraw relayer fee. */
const TRX_DEPOSIT_AMOUNT = 5_000_000n;

interface OrderStatusResponse extends DepositAndWithdrawStatusSnapshot {
  success: boolean;
}

const fetchOrderStatus = async (
  orderId: string,
  chainId: number,
  session: EnclaveSessionAuthFields,
): Promise<OrderStatusResponse> => {
  const queryString = new URLSearchParams(sessionQueryParams(session, chainId)).toString();
  // The signature is bound to the express route pattern, not the concrete URL.
  const headers = requestSignatureGetHeader(session, '/private-send/:orderId', queryString);
  try {
    return await httpClient.get<OrderStatusResponse>(`${ENCLAVE_API_URL}/private-send/${orderId}?${queryString}`, {
      headers,
    });
  } catch (err) {
    if (axios.isAxiosError(err)) {
      throw new Error(`GET /private-send/${orderId} → ${err.response?.status}: ${JSON.stringify(err.response?.data)}`);
    }
    throw err;
  }
};

const pollUntil = async <T>(read: () => Promise<T>, isDone: (value: T) => boolean): Promise<T> => {
  const deadline = Date.now() + DEFAULT_POLL_TIMEOUT_MS;
  let value = await read();
  while (!isDone(value) && Date.now() < deadline) {
    // eslint-disable-next-line no-await-in-loop
    await waitLittle(DEFAULT_POLL_INTERVAL_MS);
    // eslint-disable-next-line no-await-in-loop
    value = await read();
  }
  return value;
};

const isTerminalScheduledStatus = (status: string) =>
  status === ScheduledTransactionStatus.COMPLETED ||
  status === ScheduledTransactionStatus.FAILED ||
  status === ScheduledTransactionStatus.DEPOSIT_FAILED;

const getTrxBalance = async (tronWallet: TronTestWallet, address: string): Promise<bigint> =>
  BigInt(await tronWallet.tronWeb.trx.getBalance(address));

const getStuckTrxBalance = async (tronWallet: TronTestWallet, session: EnclaveSessionAuthFields): Promise<bigint> => {
  const params = new URLSearchParams(sessionQueryParams(session, tronWallet.chainId));
  const queryString = params.toString();
  const headers = requestSignatureGetHeader(session, '/stuck-utxo-balance', queryString);
  const response = await httpClient.get<BalanceResponse>(`${ENCLAVE_API_URL}/stuck-utxo-balance?${queryString}`, {
    headers,
  });
  if (response.success === false) throw new Error(response.error);
  return BigInt(
    response.balances.find((b) => b.tokenAddress.toLowerCase() === TRON_NILE_TRX_ADDRESS.toLowerCase())?.balance ?? '0',
  );
};

const withdrawStuckTrx = async (
  tronWallet: TronTestWallet,
  session: EnclaveSessionAuthFields,
  recipientAddress: string,
): Promise<string[]> => {
  const params = {
    chainId: tronWallet.chainId,
    tokenAddress: TRON_NILE_TRX_ADDRESS,
    recipientAddress: addressToHexFormat(recipientAddress),
  };
  const { body, headers } = buildAuthPostTron(session, tronWallet.chainId, '/withdraw-stuck-utxos', params, () =>
    buildWithdrawStuckUtxosAuthFieldsTron(session, tronWallet.tronWeb, params),
  );
  const response = await httpClient.post<{ success: true; txHashes: string[] }>(
    `${ENCLAVE_API_URL}/withdraw-stuck-utxos`,
    body,
    headers ? { headers } : undefined,
  );
  return response.txHashes;
};

describe('POST /withdraw-stuck-utxos after a failed deposit-and-withdraw (Tron Nile)', () => {
  jest.setTimeout(900_000);

  // The sender wallet doubles as the Nile relayer, so it pays the relay energy fee for every
  // transact (deposit, the failed withdraw, and the stuck withdraw). Its own native balance is
  // therefore dominated by gas, so recovered TRX is sent to a fresh throwaway address whose
  // balance moves only when it actually receives the funds.
  let tronWallet: TronTestWallet;

  beforeAll(() => {
    tronWallet = getEnclaveTronTestWallet();
  });

  it('deposit-and-withdraw of TRX to the USDT contract fails the scheduled withdraw, then stuck UTXOs are withdrawn', async () => {
    const session = await createEnclaveSessionTron(tronWallet.tronWeb, tronWallet.address);
    const stuckBefore = await getStuckTrxBalance(tronWallet, session);
    console.log(`[1/6] session created for ${tronWallet.address}, stuck TRX before: ${stuckBefore}`);

    // The USDT contract has no payable fallback, so the relayer's TRX transfer to it reverts.
    const order = await prepareDepositAndWithdraw(
      tronWallet,
      [{ address: TRON_NILE_USDT_ADDRESS, amount: TRX_DEPOSIT_AMOUNT }],
      session,
      TRON_NILE_TRX_ADDRESS,
    );

    expect(order.orderId).toBeDefined();
    expect(order.serializedTx).toBeDefined();
    expect(BigInt(order.amountIn).toString()).toBe((BigInt(order.amountOut) + BigInt(order.fee)).toString());
    console.log(
      `[2/6] order ${order.orderId} prepared: amountIn=${order.amountIn} amountOut=${order.amountOut} fee=${order.fee}`,
    );

    // Native TRX is sent as callValue, so no TRC20 approval is needed.
    const txid = await broadcastPalDepositTx(tronWallet, order.serializedTx);
    expect(txid).toBeTruthy();
    await waitForTransactionConfirmation(TRON_NILE_CHAIN_ID, txid);
    console.log(`[3/6] deposit ${txid} confirmed, waiting for the scheduled withdraw to fail...`);

    const finalStatus = await pollUntil(
      () => fetchOrderStatus(order.orderId, tronWallet.chainId, session),
      (data) =>
        data.status === DepositAndWithdrawPublicStatus.Failed ||
        (data.status === DepositAndWithdrawPublicStatus.Scheduled &&
          (data.scheduledTransactions?.length ?? 0) > 0 &&
          (data.scheduledTransactions ?? []).every((tx) => isTerminalScheduledStatus(tx.status))),
    );
    expect(finalStatus.status).toBe(DepositAndWithdrawPublicStatus.Scheduled);
    expect(finalStatus.scheduledTransactions?.length).toBeGreaterThan(0);
    expect(finalStatus.scheduledTransactions?.every((tx) => tx.status === ScheduledTransactionStatus.FAILED)).toBe(
      true,
    );
    console.log(
      `[4/6] order status=${finalStatus.status}, scheduled txs: ${JSON.stringify(finalStatus.scheduledTransactions)}`,
    );

    // The whole deposited note (recipient amount + fee) is stuck now.
    const expectedStuck = stuckBefore + BigInt(order.amountIn);
    const stuckAfterFailure = await pollUntil(
      () => getStuckTrxBalance(tronWallet, session),
      (value) => value === expectedStuck,
    );
    expect(stuckAfterFailure).toBe(expectedStuck);
    console.log(`[5/6] stuck TRX after failed withdraw: ${stuckAfterFailure} (expected ${expectedStuck})`);

    // Fresh throwaway address: it is not the relayer and starts empty, so its balance rises by
    // exactly the recovered TRX once the withdraw settles.
    const recipientAddress: string = (await tronWallet.tronWeb.createAccount()).address.base58;
    const recipientTrxBefore = await getTrxBalance(tronWallet, recipientAddress);
    const txHashes = await withdrawStuckTrx(tronWallet, session, recipientAddress);
    expect(txHashes.length).toBeGreaterThan(0);
    console.log(`[6/6] stuck withdraw submitted to ${recipientAddress}: ${txHashes.join(', ')}`);
    await Promise.all(txHashes.map((hash) => waitForTransactionConfirmation(TRON_NILE_CHAIN_ID, hash)));

    const stuckAfterWithdraw = await pollUntil(
      () => getStuckTrxBalance(tronWallet, session),
      (value) => value === 0n,
    );
    expect(stuckAfterWithdraw).toBe(0n);

    const recipientTrxAfter = await pollUntil(
      () => getTrxBalance(tronWallet, recipientAddress),
      (value) => value > recipientTrxBefore,
    );
    expect(recipientTrxAfter).toBeGreaterThan(recipientTrxBefore);
    console.log(
      `done: stuck TRX=${stuckAfterWithdraw}, recipient TRX ${recipientTrxBefore} -> ${recipientTrxAfter} (+${
        recipientTrxAfter - recipientTrxBefore
      })`,
    );
  });
});
