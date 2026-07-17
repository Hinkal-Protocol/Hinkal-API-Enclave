import { waitForEthereumTransactionConfirmation } from '@hinkal/common';
import { getWaasTestContext, type WaasTestContext } from '../utils/waasTestSetup';
import { BalanceRow, getBalanceForToken, toUnits, USDC_DECIMALS } from '../utils/waasBalanceHelpers';

const TX_AMOUNT = '0.01';
const SHIELD_AMOUNT = '0.1';
const UNSHIELD_AMOUNT = '0.001';

type ScheduledTxResult = { status: string; txHash: string | null };

async function pollScheduledTransactionOnce(
  ctx: WaasTestContext,
  scheduleId: string,
  deadline: number,
  intervalMs: number,
): Promise<ScheduledTxResult[]> {
  const { transactions } = await ctx.client.getJson<{
    scheduleId: string;
    transactions: ScheduledTxResult[];
  }>(
    `/waas/scheduled-transaction/${scheduleId}`,
    {
      organizationId: ctx.organizationId,
      userId: ctx.userId,
      walletAddress: ctx.evmAddress,
    },
    ctx.userKp,
  );
  const isTerminal = (tx: ScheduledTxResult) => tx.status === 'completed' || tx.status === 'failed';
  if (transactions.length > 0 && transactions.every(isTerminal)) return transactions;
  if (Date.now() >= deadline) throw new Error(`Timed out polling scheduleId ${scheduleId}`);
  await new Promise<void>((resolve) => {
    setTimeout(resolve, intervalMs);
  });
  return pollScheduledTransactionOnce(ctx, scheduleId, deadline, intervalMs);
}

const pollScheduledTransaction = (
  ctx: WaasTestContext,
  scheduleId: string,
  { intervalMs = 3000, timeoutMs = 120_000 } = {},
) => pollScheduledTransactionOnce(ctx, scheduleId, Date.now() + timeoutMs, intervalMs);

async function getPublicBalanceRows(ctx: WaasTestContext) {
  return ctx.client.getJson<BalanceRow[]>(
    '/waas/public-balance',
    {
      walletAddress: ctx.evmAddress,
      chainId: String(ctx.chainId),
    },
    ctx.userKp,
  );
}

async function getPrivateBalanceRows(ctx: WaasTestContext) {
  return ctx.client.getJson<BalanceRow[]>(
    '/waas/private-balance',
    {
      organizationId: ctx.organizationId,
      userId: ctx.userId,
      walletAddress: ctx.evmAddress,
      chainId: String(ctx.chainId),
    },
    ctx.userKp,
  );
}

describe('WAAS transactions E2E (EVM)', () => {
  jest.setTimeout(300_000);

  let ctx: WaasTestContext;

  beforeAll(async () => {
    ctx = await getWaasTestContext();
  }, 600_000);

  describe('transaction routes (EVM)', () => {
    it('public-to-public', async () => {
      const publicBefore = getBalanceForToken(await getPublicBalanceRows(ctx), ctx.usdcTokenAddress);
      const { txHash, scheduleId } = await ctx.client.postJson<{ txHash: string; scheduleId: string }>(
        '/waas/public-to-public',
        {
          organizationId: ctx.organizationId,
          userId: ctx.userId,
          fromAddress: ctx.evmAddress,
          to: ctx.evmAddress,
          token: ctx.usdcTokenAddress,
          amount: TX_AMOUNT,
          chainId: ctx.chainId,
        },
        ctx.userKp,
      );
      await waitForEthereumTransactionConfirmation(ctx.chainId, txHash);
      const withdrawal = await pollScheduledTransaction(ctx, scheduleId);
      expect(withdrawal.every((tx) => tx.status === 'completed')).toBe(true);
      const publicAfter = getBalanceForToken(await getPublicBalanceRows(ctx), ctx.usdcTokenAddress);
      expect(publicAfter < publicBefore).toBe(true);
    });

    it('public-to-private', async () => {
      const privateBefore = getBalanceForToken(await getPrivateBalanceRows(ctx), ctx.usdcTokenAddress);
      const { txHash } = await ctx.client.postJson<{ txHash: string }>(
        '/waas/public-to-private',
        {
          organizationId: ctx.organizationId,
          userId: ctx.userId,
          fromAddress: ctx.evmAddress,
          to: ctx.evmAddress,
          token: ctx.usdcTokenAddress,
          amount: SHIELD_AMOUNT,
          chainId: ctx.chainId,
        },
        ctx.userKp,
      );
      await waitForEthereumTransactionConfirmation(ctx.chainId, txHash);
      const privateAfter = getBalanceForToken(await getPrivateBalanceRows(ctx), ctx.usdcTokenAddress);
      expect(privateAfter.toString()).toBe((privateBefore + toUnits(SHIELD_AMOUNT, USDC_DECIMALS)).toString());
    });

    it('private-to-public', async () => {
      const publicBefore = getBalanceForToken(await getPublicBalanceRows(ctx), ctx.usdcTokenAddress);
      const { txHash } = await ctx.client.postJson<{ txHash: string }>(
        '/waas/private-to-public',
        {
          organizationId: ctx.organizationId,
          userId: ctx.userId,
          fromAddress: ctx.evmAddress,
          to: ctx.evmAddress,
          token: ctx.usdcTokenAddress,
          amount: UNSHIELD_AMOUNT,
          chainId: ctx.chainId,
        },
        ctx.userKp,
      );
      await waitForEthereumTransactionConfirmation(ctx.chainId, txHash);
      const publicAfter = getBalanceForToken(await getPublicBalanceRows(ctx), ctx.usdcTokenAddress);
      expect(publicAfter.toString()).toBe((publicBefore + toUnits(UNSHIELD_AMOUNT, USDC_DECIMALS)).toString());
    });

    it('private-to-private', async () => {
      const privateBefore = getBalanceForToken(await getPrivateBalanceRows(ctx), ctx.usdcTokenAddress);
      const { txHash } = await ctx.client.postJson<{ txHash: string }>(
        '/waas/private-to-private',
        {
          organizationId: ctx.organizationId,
          userId: ctx.userId,
          fromAddress: ctx.evmAddress,
          to: ctx.evmAddress,
          token: ctx.usdcTokenAddress,
          amount: UNSHIELD_AMOUNT,
          chainId: ctx.chainId,
        },
        ctx.userKp,
      );
      await waitForEthereumTransactionConfirmation(ctx.chainId, txHash);
      const privateAfter = getBalanceForToken(await getPrivateBalanceRows(ctx), ctx.usdcTokenAddress);
      expect(privateAfter < privateBefore).toBe(true);
    });

    it('withdraw-stuck-utxos', async () => {
      await ctx.client.postJson<{ txHashes: unknown }>(
        '/waas/withdraw-stuck-utxos',
        {
          organizationId: ctx.organizationId,
          userId: ctx.userId,
          fromAddress: ctx.evmAddress,
          token: ctx.usdcTokenAddress,
          chainId: ctx.chainId,
          recipientAddress: ctx.evmAddress,
        },
        ctx.userKp,
      );
    });
  });

  describe('balance routes', () => {
    it('GET /waas/public-balance', async () => {
      const rows = await getPublicBalanceRows(ctx);
      expect(Array.isArray(rows)).toBe(true);
    });

    it('GET /waas/private-balance', async () => {
      const rows = await getPrivateBalanceRows(ctx);
      expect(Array.isArray(rows)).toBe(true);
    });

    it('GET /waas/stuck-utxo-balance', async () => {
      await ctx.client.getJson<unknown[]>(
        '/waas/stuck-utxo-balance',
        {
          organizationId: ctx.organizationId,
          userId: ctx.userId,
          walletAddress: ctx.evmAddress,
          chainId: String(ctx.chainId),
        },
        ctx.userKp,
      );
    });

    it('GET /waas/refresh-cache', async () => {
      await ctx.client.getJson<unknown>(
        '/waas/refresh-cache',
        {
          organizationId: ctx.organizationId,
          userId: ctx.userId,
          walletAddress: ctx.evmAddress,
          chainId: String(ctx.chainId),
        },
        ctx.userKp,
      );
    });
  });

  describe('wallet action routes (EVM)', () => {
    it('POST /waas/wallet/sign-message', async () => {
      const data = await ctx.client.postJson<{ signature: string }>(
        '/waas/wallet/sign-message',
        {
          organizationId: ctx.organizationId,
          userId: ctx.userId,
          fromAddress: ctx.evmAddress,
          chainId: ctx.chainId,
          message: 'Hello from WAAS E2E',
        },
        ctx.userKp,
      );
      expect(data.signature.length).toBeGreaterThan(10);
    });

    it('POST /waas/wallet/send', async () => {
      await ctx.client.postJson<{ txHash: string }>(
        '/waas/wallet/send',
        {
          organizationId: ctx.organizationId,
          userId: ctx.userId,
          fromAddress: ctx.evmAddress,
          to: ctx.evmAddress,
          token: ctx.usdcTokenAddress,
          amount: '0.001',
          chainId: ctx.chainId,
        },
        ctx.userKp,
      );
    });

    it('POST /waas/wallet/sign-typed-data', async () => {
      const data = await ctx.client.postJson<{ signature: string }>(
        '/waas/wallet/sign-typed-data',
        {
          organizationId: ctx.organizationId,
          userId: ctx.userId,
          fromAddress: ctx.evmAddress,
          chainId: ctx.chainId,
          domain: { name: 'Test', version: '1', chainId: ctx.chainId },
          types: { Message: [{ name: 'content', type: 'string' }] },
          value: { content: 'Hello' },
        },
        ctx.userKp,
      );
      expect(data.signature.length).toBeGreaterThan(10);
    });
  });
});
