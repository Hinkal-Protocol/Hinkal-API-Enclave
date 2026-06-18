import axios from 'axios';
import {
  ENCLAVE_API_URL,
  httpClient,
  ScheduledTransactionStatus,
  waitForTransactionConfirmation,
} from '@hinkal/common';
import { createEnclaveSolanaSession } from '../../utils/enclaveSolanaAuthHelper';
import {
  broadcastPalDepositTx,
  getSolanaTokenBalance,
  prepareDepositAndWithdraw,
} from '../../utils/solanaIntegrationHelpers';
import { DepositAndWithdrawPublicStatus } from '../../../utils/resolveDepositAndWithdrawPublicStatus';
import {
  DEFAULT_POLL_INTERVAL_MS,
  DEFAULT_POLL_TIMEOUT_MS,
  DepositAndWithdrawStatusSnapshot,
  pollDepositAndWithdrawUntilComplete,
} from '../../utils/pollDepositAndWithdrawStatus';
import { SOLANA_MAINNET_CHAIN_ID } from '../../utils/solanaTestConstants';
import {
  getEnclaveSolanaRecipientTestWallet,
  getEnclaveSolanaTestWallet,
  type SolanaTestWallet,
} from '../../utils/solanaTestWallet';

interface OrderStatusResponse extends DepositAndWithdrawStatusSnapshot {
  success: boolean;
}

let senderWallet: SolanaTestWallet;
let recipientWallet: SolanaTestWallet;

beforeAll(() => {
  senderWallet = getEnclaveSolanaTestWallet();
  recipientWallet = getEnclaveSolanaRecipientTestWallet();
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

describe('deposit-and-withdraw route (Solana mainnet)', () => {
  jest.setTimeout(600_000);

  it('single recipient: prepares order, broadcasts deposit, polls until scheduled txs complete, recipient receives USDC', async () => {
    const DEPOSIT_AMOUNT = BigInt('10000'); // 0.01 USDC

    const recipientBefore = await getSolanaTokenBalance(recipientWallet);

    const session = await createEnclaveSolanaSession(senderWallet);

    const order = await prepareDepositAndWithdraw(
      senderWallet,
      [{ address: recipientWallet.address, amount: DEPOSIT_AMOUNT }],
      session,
    );

    expect(order.orderId).toBeDefined();
    expect(order.serializedTx).toBeDefined();
    expect(BigInt(order.amountIn).toString()).toBe((BigInt(order.amountOut) + BigInt(order.fee)).toString());

    const txid = await broadcastPalDepositTx(senderWallet, order.serializedTx);
    expect(txid).toBeTruthy();
    await waitForTransactionConfirmation(SOLANA_MAINNET_CHAIN_ID, txid);

    const finalStatus = await pollOrderUntilComplete(order.orderId);
    expect(finalStatus.status).toBe(DepositAndWithdrawPublicStatus.Scheduled);
    expect(finalStatus.scheduledTransactions?.every((tx) => tx.status === ScheduledTransactionStatus.COMPLETED)).toBe(
      true,
    );

    const recipientAfter = await getSolanaTokenBalance(recipientWallet);
    expect(recipientAfter - recipientBefore).toBe(BigInt(order.amountOut));
  });
});
