/* eslint-disable no-console */

/* run with:
DOTENV_OVERRIDE="$PWD/apps/enclave-api/.env" \
TS_NODE_TRANSPILE_ONLY=1 TS_NODE_PROJECT=tsconfig.base.json \
TS_NODE_COMPILER_OPTIONS='{"module":"commonjs","moduleResolution":"node","esModuleInterop":true}' \
npx ts-node -r tsconfig-paths/register apps/enclave-api/src/tests/test-scripts/tron-send-script.ts
*/

import { ENCLAVE_API_URL, evmHexToTronBase58Address, httpClient, waitForTransactionConfirmation } from '@hinkal/common';
import { getEnclaveTronTestWallet } from '../utils/tronTestWallet';
import { createEnclaveSessionTron } from '../utils/enclaveAuthHelperTron';
import {
  approveTronUsdt,
  broadcastPalDepositTx,
  getTronUsdtBalance,
  prepareDepositAndWithdraw,
} from '../utils/tronIntegrationHelpers';
import {
  DEFAULT_POLL_INTERVAL_MS,
  DEFAULT_POLL_TIMEOUT_MS,
  DepositAndWithdrawStatusSnapshot,
  pollDepositAndWithdrawUntilComplete,
} from '../utils/pollDepositAndWithdrawStatus';
import { DepositAndWithdrawPublicStatus } from '../../utils/resolveDepositAndWithdrawPublicStatus';
import { TRON_NILE_CHAIN_ID, TRON_NILE_USDT_ADDRESS } from '../utils/tronTestConstants';

interface OrderStatusResponse extends DepositAndWithdrawStatusSnapshot {
  success?: boolean;
}

async function main() {
  // --- inputs ---
  const recipientAddresses = (process.env['RECIPIENT_ADDRESSES'] ?? '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
  if (recipientAddresses.length === 0) throw new Error('Set RECIPIENT_ADDRESSES (comma-separated)');

  const amountPerRecipient = BigInt(process.env['AMOUNT'] ?? '300000'); // 0.3 USDT (6 decimals)
  const tokenAddress = process.env['TOKEN_ADDRESS'] ?? TRON_NILE_USDT_ADDRESS;

  const sender = getEnclaveTronTestWallet(); // reads ENCLAVE_TESTING_PRIVATE_KEY, chainId = tronNile
  console.log('enclave-api   :', ENCLAVE_API_URL);
  console.log('chainId       :', TRON_NILE_CHAIN_ID, '(tron nile)');
  console.log('sender        :', sender.address);
  console.log('token         :', tokenAddress);
  console.log('recipients    :', recipientAddresses.join(', '));
  console.log('amount each   :', amountPerRecipient.toString());
  console.log('sender balance:', (await getTronUsdtBalance(sender, tokenAddress)).toString());

  // 1) open the 712 session
  const session = await createEnclaveSessionTron(sender.tronWeb, sender.address);
  console.log('\n[1] session opened (useEIP712=%s) sessionId=%s', session.useEIP712, session.sessionId);

  // 2) prepare the private-send order (POST /private-send, EIP-712 signed)
  //    txCompletionTime = now -> relayer broadcasts the withdrawals straight after the deposit
  //    (no randomized scheduling window). Override with TX_COMPLETION_TIME (unix seconds) to spread them out.
  const recipients = recipientAddresses.map((address) => ({ address, amount: amountPerRecipient }));
  const order = await prepareDepositAndWithdraw(sender, recipients, session, tokenAddress);
  console.log('[2] order prepared:', {
    orderId: order.orderId,
    amountIn: order.amountIn,
    amountOut: order.amountOut,
    fee: order.fee,
    approvalAddress: order.approvalAddress,
  });

  // 3) approve the deposit pull, if required
  if (order.approvalAddress) {
    const spender = evmHexToTronBase58Address(order.approvalAddress);
    console.log('[3] approving %s to %s ...', order.amountIn, spender);
    await approveTronUsdt(sender, spender, BigInt(order.amountIn), tokenAddress);
  }

  // 4) broadcast the deposit tx returned by the enclave
  const depositTxid = await broadcastPalDepositTx(sender, order.serializedTx);
  console.log('[4] deposit broadcast txid=%s — waiting for confirmation ...', depositTxid);
  await waitForTransactionConfirmation(TRON_NILE_CHAIN_ID, depositTxid);

  // 5) poll until the enclave schedules + completes the withdrawals to each recipient
  const fetchOrderStatus = (orderId: string): Promise<OrderStatusResponse> =>
    httpClient
      .get<OrderStatusResponse>(`${ENCLAVE_API_URL}/private-send/${orderId}`)
      .catch((err: { response?: { status?: number; data?: unknown }; message?: string }) => {
        const status = err?.response?.status;
        const data = err?.response?.data ? JSON.stringify(err.response.data) : err?.message;
        throw new Error(`GET /private-send/${orderId} -> ${status}: ${data}`);
      });

  console.log('[5] polling order status ...');
  const finalStatus = await pollDepositAndWithdrawUntilComplete(() => fetchOrderStatus(order.orderId), {
    label: order.orderId,
    timeoutMs: DEFAULT_POLL_TIMEOUT_MS,
    intervalMs: DEFAULT_POLL_INTERVAL_MS,
  });

  console.log('\nfinal status:', finalStatus.status);
  console.log('scheduled txs:', JSON.stringify(finalStatus.scheduledTransactions ?? [], null, 2));

  if (finalStatus.status !== DepositAndWithdrawPublicStatus.Scheduled) {
    throw new Error(`order did not reach Scheduled (status=${finalStatus.status})`);
  }
  console.log('\n✅ private-send complete for order', order.orderId);
}

main().catch((err) => {
  console.error('\n❌ tron-private-send failed:', err);
  process.exit(1);
});
