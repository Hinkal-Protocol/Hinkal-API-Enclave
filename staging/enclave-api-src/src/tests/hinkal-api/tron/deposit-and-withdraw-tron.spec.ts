import axios from 'axios';
import {
  ENCLAVE_API_URL,
  evmHexToTronBase58Address,
  httpClient,
  ScheduledTransactionStatus,
  waitForTransactionConfirmation,
} from '@hinkal/common';
import {
  approveTronUsdt,
  broadcastPalDepositTx,
  getTronUsdtBalance,
  prepareDepositAndWithdraw,
} from '../../utils/tronIntegrationHelpers';
import { DepositAndWithdrawPublicStatus } from '../../../utils/resolveDepositAndWithdrawPublicStatus';
import {
  DEFAULT_POLL_INTERVAL_MS,
  DEFAULT_POLL_TIMEOUT_MS,
  DepositAndWithdrawStatusSnapshot,
  pollDepositAndWithdrawUntilComplete,
} from '../../utils/pollDepositAndWithdrawStatus';
import { TRON_NILE_CHAIN_ID } from '../../utils/tronTestConstants';
import {
  getEnclaveTronRecipientTestWallet,
  getEnclaveTronTestWallet,
  type TronTestWallet,
} from '../../utils/tronTestWallet';

interface OrderStatusResponse extends DepositAndWithdrawStatusSnapshot {
  success: boolean;
}

let senderWallet: TronTestWallet;
let recipientWallet: TronTestWallet;

beforeAll(() => {
  senderWallet = getEnclaveTronTestWallet();
  recipientWallet = getEnclaveTronRecipientTestWallet();
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

const pollOrderUntilComplete = (orderId: string) =>
  pollDepositAndWithdrawUntilComplete(() => fetchOrderStatus(orderId), {
    label: orderId,
    timeoutMs: DEFAULT_POLL_TIMEOUT_MS,
    intervalMs: DEFAULT_POLL_INTERVAL_MS,
  });

describe('deposit-and-withdraw route (Tron Nile)', () => {
  jest.setTimeout(600_000);

  it('single recipient: prepares order, broadcasts deposit, polls until scheduled txs complete, recipient receives USDT', async () => {
    const DEPOSIT_AMOUNT = BigInt('300000'); // 0.3 USDT

    const recipientBefore = await getTronUsdtBalance(recipientWallet);

    const order = await prepareDepositAndWithdraw(senderWallet, [
      { address: recipientWallet.address, amount: DEPOSIT_AMOUNT },
    ]);

    expect(order.orderId).toBeDefined();
    expect(order.serializedTx).toBeDefined();
    expect(BigInt(order.amountIn).toString()).toBe((BigInt(order.amountOut) + BigInt(order.fee)).toString());

    if (order.approvalAddress) {
      await approveTronUsdt(senderWallet, evmHexToTronBase58Address(order.approvalAddress), BigInt(order.amountIn));
    }

    const txid = await broadcastPalDepositTx(senderWallet, order.serializedTx);
    expect(txid).toBeTruthy();
    await waitForTransactionConfirmation(TRON_NILE_CHAIN_ID, txid);

    const finalStatus = await pollOrderUntilComplete(order.orderId);
    expect(finalStatus.status).toBe(DepositAndWithdrawPublicStatus.Scheduled);
    expect(finalStatus.scheduledTransactions?.every((tx) => tx.status === ScheduledTransactionStatus.COMPLETED)).toBe(
      true,
    );

    const recipientAfter = await getTronUsdtBalance(recipientWallet);
    expect(recipientAfter - recipientBefore).toBe(BigInt(order.amountOut));
  });
});
