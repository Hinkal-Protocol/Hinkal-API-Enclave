import { chainIds } from '@hinkal/common';
import { getWaasTestContext, type WaasTestContext } from '../utils/waasTestSetup';

jest.setTimeout(300_000);

const USDC_BY_CHAIN: Record<number, string> = {
  137: '0x3c499c542cef5e3811e1192ce70d8cc03d5c3359',
  8453: '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913',
};

const WETH_BY_CHAIN: Record<number, string> = {
  137: '0x7ceB23fD6bC0adD59E62ac25578270cFf1b9f619',
  8453: '0x4200000000000000000000000000000000000006',
};

const SOLANA_USDC = 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v';

describe('WAAS wallet swap cross-chain bridge (integration)', () => {
  let ctx: WaasTestContext;
  let destChainId: number;

  beforeAll(async () => {
    ctx = await getWaasTestContext();
    destChainId = ctx.chainId === 8453 ? 137 : 8453;
  });

  const baseBody = () => ({
    organizationId: ctx.organizationId,
    userId: ctx.userId,
    fromAddress: ctx.evmAddress,
    amount: '0.5',
    chainId: ctx.chainId,
  });

  it('rejects cross-chain wallet swap to an unsupported evm chain', async () => {
    const { status, text } = await ctx.client.postRaw(
      '/waas/wallet/swap',
      {
        ...baseBody(),
        fromToken: USDC_BY_CHAIN[ctx.chainId],
        toToken: USDC_BY_CHAIN[destChainId],
        toChainId: chainIds.arcTestnet,
      },
      ctx.userKp,
    );
    expect(status).toBe(400);
    expect(text).toMatch(/is not supported/i);
  });

  it('accepts an evm-to-solana bridge request and fails only on wallet funds', async () => {
    const { status, text } = await ctx.client.postRaw(
      '/waas/wallet/swap',
      {
        ...baseBody(),
        fromToken: USDC_BY_CHAIN[ctx.chainId],
        toToken: SOLANA_USDC,
        toChainId: chainIds.solanaMainnet,
      },
      ctx.userKp,
    );
    expect(status).toBeGreaterThanOrEqual(400);
    expect(text).not.toMatch(/is not supported|supported between these chains only|same token only/i);
  });

  it('accepts a cross-token evm bridge request and fails only on wallet funds', async () => {
    const { status, text } = await ctx.client.postRaw(
      '/waas/wallet/swap',
      {
        ...baseBody(),
        fromToken: USDC_BY_CHAIN[ctx.chainId],
        toToken: WETH_BY_CHAIN[destChainId],
        toChainId: destChainId,
      },
      ctx.userKp,
    );
    expect(status).toBeGreaterThanOrEqual(400);
    expect(text).not.toMatch(/is not supported|supported between these chains only|same token only/i);
  });

  it('rejects a tron-sourced bridge to a chain NEAR intents does not support', async () => {
    const tronAddress = process.env.WAAS_TESTING_TRON_ADDRESS;
    if (!tronAddress) return;
    const { status, text } = await ctx.client.postRaw(
      '/waas/wallet/swap',
      {
        ...baseBody(),
        fromAddress: tronAddress,
        chainId: chainIds.tronMainnet,
        fromToken: '0xa614f803B6FD780986A42c78Ec9c7f77e6DeD13C',
        toToken: '0xa614f803B6FD780986A42c78Ec9c7f77e6DeD13C',
        toChainId: 5042002,
      },
      ctx.userKp,
    );
    expect(status).toBe(400);
    expect(text).toMatch(/is not supported/i);
  });

  it('accepts a tron-sourced cross-token bridge request and fails only on wallet funds', async () => {
    const tronAddress = process.env.WAAS_TESTING_TRON_ADDRESS;
    if (!tronAddress) return;
    const { status, text } = await ctx.client.postRaw(
      '/waas/wallet/swap',
      {
        ...baseBody(),
        fromAddress: tronAddress,
        chainId: chainIds.tronMainnet,
        fromToken: '0xa614f803B6FD780986A42c78Ec9c7f77e6DeD13C',
        toToken: '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48',
        toChainId: chainIds.ethMainnet,
      },
      ctx.userKp,
    );
    expect(status).toBeGreaterThanOrEqual(400);
    expect(text).not.toMatch(/is not supported|same token only/i);
  });

  it('accepts a cross-chain quote request and fails only on wallet funds', async () => {
    const { status, text } = await ctx.client.postRaw(
      '/waas/wallet/swap',
      {
        ...baseBody(),
        fromToken: USDC_BY_CHAIN[ctx.chainId],
        toToken: USDC_BY_CHAIN[destChainId],
        toChainId: destChainId,
      },
      ctx.userKp,
    );
    expect(status).toBeGreaterThanOrEqual(400);
    expect(text).not.toMatch(/supported between these chains only|same token only|must be different tokens/i);
  });
});
