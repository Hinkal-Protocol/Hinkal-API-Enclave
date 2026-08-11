import { chainIds, waitForEthereumTransactionConfirmation } from '@hinkal/common';
import { caseInsensitiveEqual } from '@hinkal/common/functions/utils/caseInsensitive.utils';
import { getWaasTestContext, type WaasTestContext } from '../utils/waasTestSetup';
import { BalanceRow, getBalanceForToken, toUnits, USDC_DECIMALS } from '../utils/waasBalanceHelpers';

const SWAP_AMOUNT = '0.5';

const OUT_TOKEN_BY_CHAIN: Record<number, string> = {
  137: '0x7ceB23fD6bC0adD59E62ac25578270cFf1b9f619', // WETH on Polygon
  8453: '0x4200000000000000000000000000000000000006', // WETH on Base
};

const OUT_TOKEN_DECIMALS = 18;
const UNOWNED_WALLET_ADDRESS = '0x000000000000000000000000000000000000dEaD';

type NonEvmSwapConfig = {
  label: string;
  chainId: number;
  fromToken: string;
  toToken: string;
  amount: string;
  addressKey: 'tron' | 'solana';
  walletAddress?: string;
};

const TRON_USDT = '0xa614f803B6FD780986A42c78Ec9c7f77e6DeD13C';
const TRON_USDC = '0x3487b63d30b5b2c87fb7ffa8bcfade38eaac1abe';
const SOLANA_USDC = 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v';
const SOLANA_WSOL = 'So11111111111111111111111111111111111111112';

const nonEvmSwapConfigs = (): NonEvmSwapConfig[] => [
  {
    label: 'tron',
    chainId: chainIds.tronMainnet,
    fromToken: process.env.WAAS_TEST_TRON_FROM_TOKEN ?? TRON_USDT,
    toToken: process.env.WAAS_TEST_TRON_TO_TOKEN ?? TRON_USDC,
    amount: process.env.WAAS_TEST_TRON_AMOUNT ?? SWAP_AMOUNT,
    addressKey: 'tron' as const,
    walletAddress: process.env.WAAS_TESTING_TRON_ADDRESS,
  },
  {
    label: 'solana',
    chainId: chainIds.solanaMainnet,
    fromToken: process.env.WAAS_TEST_SOLANA_FROM_TOKEN ?? SOLANA_USDC,
    toToken: process.env.WAAS_TEST_SOLANA_TO_TOKEN ?? SOLANA_WSOL,
    amount: process.env.WAAS_TEST_SOLANA_AMOUNT ?? SWAP_AMOUNT,
    addressKey: 'solana' as const,
    walletAddress: process.env.WAAS_TESTING_SOLANA_ADDRESS,
  },
];

type SwapResponse = {
  txHash: string;
  approveTxHash?: string;
  expectedOutput?: string;
  minimumOutput?: string;
  depositAddress?: string;
  destinationChainId?: number;
  destinationRecipient?: string;
};

type WalletAddresses = { evm?: string; tron?: string; solana?: string };

const pollUntil = async (check: () => Promise<boolean>, timeoutMs = 120_000, intervalMs = 5000): Promise<boolean> => {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    // eslint-disable-next-line no-await-in-loop
    if (await check()) return true;
    // eslint-disable-next-line no-await-in-loop
    await new Promise<void>((resolve) => {
      setTimeout(resolve, intervalMs);
    });
  }
  return false;
};

async function getPublicBalanceRows(ctx: WaasTestContext, walletAddress = ctx.evmAddress, chainId = ctx.chainId) {
  return ctx.client.getJson<BalanceRow[]>(
    '/waas/public-balance',
    {
      walletAddress,
      chainId: String(chainId),
    },
    ctx.userKp,
  );
}

async function getWalletAddresses(ctx: WaasTestContext): Promise<WalletAddresses> {
  const { wallets } = await ctx.client.getJson<{ wallets: WalletAddresses[] }>(
    '/waas/get-wallets',
    {
      organizationId: ctx.organizationId,
      userId: ctx.userId,
    },
    ctx.userKp,
  );
  const match = wallets.find((wallet) => caseInsensitiveEqual(wallet.evm, ctx.evmAddress));
  return match ?? wallets[0] ?? {};
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

describe('WAAS swap E2E (EVM)', () => {
  jest.setTimeout(300_000);

  let ctx: WaasTestContext;
  let outTokenAddress: string;
  let walletAddresses: WalletAddresses;

  beforeAll(async () => {
    ctx = await getWaasTestContext();
    const mappedOutToken = OUT_TOKEN_BY_CHAIN[ctx.chainId];
    if (!mappedOutToken) {
      throw new Error(`No swap pair configured for chainId ${ctx.chainId}; set WAAS_TEST_CHAIN to polygon or base`);
    }
    outTokenAddress = mappedOutToken;
    walletAddresses = await getWalletAddresses(ctx);
  }, 600_000);

  const baseBody = () => ({
    organizationId: ctx.organizationId,
    userId: ctx.userId,
    fromAddress: ctx.evmAddress,
    fromToken: ctx.usdcTokenAddress,
    toToken: outTokenAddress,
    amount: SWAP_AMOUNT,
    chainId: ctx.chainId,
  });

  describe.each(['/waas/private-swap', '/waas/wallet/swap'])('%s validation', (path) => {
    it('rejects missing required fields', async () => {
      const { status } = await ctx.client.postRaw(path, { organizationId: ctx.organizationId }, ctx.userKp);
      expect(status).toBe(400);
    });

    it('rejects identical fromToken and toToken', async () => {
      const { status, text } = await ctx.client.postRaw(
        path,
        { ...baseBody(), toToken: ctx.usdcTokenAddress },
        ctx.userKp,
      );
      expect(status).toBe(400);
      expect(text).toContain('must be different tokens');
    });

    it('rejects zero amount', async () => {
      const { status, text } = await ctx.client.postRaw(path, { ...baseBody(), amount: '0' }, ctx.userKp);
      expect(status).toBe(400);
      expect(text).toContain('amount must be greater than zero');
    });

    it('rejects slippagePercentage above the cap', async () => {
      const { status, text } = await ctx.client.postRaw(path, { ...baseBody(), slippagePercentage: 99 }, ctx.userKp);
      expect(status).toBe(400);
      expect(text).toContain('slippagePercentage');
    });

    it('rejects negative slippagePercentage', async () => {
      const { status } = await ctx.client.postRaw(path, { ...baseBody(), slippagePercentage: -1 }, ctx.userKp);
      expect(status).toBe(400);
    });

    it('rejects an unknown token', async () => {
      const { status } = await ctx.client.postRaw(
        path,
        { ...baseBody(), toToken: '0x000000000000000000000000000000000000dead' },
        ctx.userKp,
      );
      expect(status).toBe(400);
    });

    it('rejects a wallet address the user does not own', async () => {
      const { status } = await ctx.client.postRaw(
        path,
        { ...baseBody(), fromAddress: UNOWNED_WALLET_ADDRESS },
        ctx.userKp,
      );
      expect([403, 404]).toContain(status);
    });
  });

  describe('private swap (shielded balance)', () => {
    it('swaps USDC for WETH inside the shielded pool', async () => {
      const rowsBefore = await getPrivateBalanceRows(ctx);
      const inBefore = getBalanceForToken(rowsBefore, ctx.usdcTokenAddress);
      const outBefore = getBalanceForToken(rowsBefore, outTokenAddress);

      const { txHash } = await ctx.client.postJson<SwapResponse>('/waas/private-swap', baseBody(), ctx.userKp);
      expect(txHash).toBeTruthy();
      await waitForEthereumTransactionConfirmation(ctx.chainId, txHash);

      const settled = await pollUntil(async () => {
        const rows = await getPrivateBalanceRows(ctx);
        return (
          getBalanceForToken(rows, ctx.usdcTokenAddress) < inBefore &&
          getBalanceForToken(rows, outTokenAddress) > outBefore
        );
      });
      expect(settled).toBe(true);

      const rowsAfter = await getPrivateBalanceRows(ctx);
      const inAfter = getBalanceForToken(rowsAfter, ctx.usdcTokenAddress);
      expect(inBefore - inAfter >= toUnits(SWAP_AMOUNT, USDC_DECIMALS)).toBe(true);
    });
  });

  describe('public wallet swap', () => {
    it('swaps USDC for WETH from the public wallet balance', async () => {
      const rowsBefore = await getPublicBalanceRows(ctx);
      const inBefore = getBalanceForToken(rowsBefore, ctx.usdcTokenAddress);
      const outBefore = getBalanceForToken(rowsBefore, outTokenAddress);

      const { txHash, approveTxHash, expectedOutput, minimumOutput } = await ctx.client.postJson<SwapResponse>(
        '/waas/wallet/swap',
        baseBody(),
        ctx.userKp,
      );

      expect(approveTxHash).toBeTruthy();
      expect(Number(expectedOutput)).toBeGreaterThan(0);
      expect(Number(minimumOutput)).toBeGreaterThan(0);
      expect(Number(minimumOutput)).toBeLessThanOrEqual(Number(expectedOutput));

      await waitForEthereumTransactionConfirmation(ctx.chainId, txHash);

      const settled = await pollUntil(async () => {
        const rows = await getPublicBalanceRows(ctx);
        return (
          getBalanceForToken(rows, ctx.usdcTokenAddress) < inBefore &&
          getBalanceForToken(rows, outTokenAddress) > outBefore
        );
      });
      expect(settled).toBe(true);

      const rowsAfter = await getPublicBalanceRows(ctx);
      const inAfter = getBalanceForToken(rowsAfter, ctx.usdcTokenAddress);
      const outAfter = getBalanceForToken(rowsAfter, outTokenAddress);
      expect(inBefore - inAfter >= toUnits(SWAP_AMOUNT, USDC_DECIMALS)).toBe(true);
      expect(outAfter - outBefore >= toUnits(String(minimumOutput), OUT_TOKEN_DECIMALS)).toBe(true);
    });
  });

  const describeNonEvm = process.env.WAAS_TEST_NON_EVM === 'false' ? describe.skip : describe;

  describeNonEvm.each(nonEvmSwapConfigs())('public wallet swap ($label)', (config: NonEvmSwapConfig) => {
    it('swaps from the public wallet balance', async () => {
      const walletAddress = config.walletAddress ?? walletAddresses[config.addressKey];
      if (!walletAddress) throw new Error(`No ${config.addressKey} address on the test wallet`);

      const balancesBefore = await getPublicBalanceRows(ctx, walletAddress, config.chainId);
      const outBefore = getBalanceForToken(balancesBefore, config.toToken);

      const { txHash, expectedOutput, minimumOutput, depositAddress, destinationRecipient } =
        await ctx.client.postJson<SwapResponse>(
          '/waas/wallet/swap',
          {
            organizationId: ctx.organizationId,
            userId: ctx.userId,
            fromAddress: walletAddress,
            fromToken: config.fromToken,
            toToken: config.toToken,
            amount: config.amount,
            chainId: config.chainId,
          },
          ctx.userKp,
        );

      expect(txHash).toBeTruthy();
      expect(Number(expectedOutput)).toBeGreaterThan(0);
      if (config.addressKey === 'tron') {
        expect(depositAddress).toBeTruthy();
        expect(caseInsensitiveEqual(destinationRecipient, walletAddress)).toBe(true);
      } else {
        expect(Number(minimumOutput)).toBeGreaterThan(0);
        expect(Number(minimumOutput)).toBeLessThanOrEqual(Number(expectedOutput));
      }

      const credited = await pollUntil(async () => {
        const rows = await getPublicBalanceRows(ctx, walletAddress, config.chainId);
        return getBalanceForToken(rows, config.toToken) > outBefore;
      });
      expect(credited).toBe(true);
    });
  });
});
