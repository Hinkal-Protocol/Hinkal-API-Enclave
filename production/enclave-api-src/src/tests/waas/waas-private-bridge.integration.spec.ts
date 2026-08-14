import { chainIds } from '@hinkal/common';
import { getWaasTestContext, type WaasTestContext } from '../utils/waasTestSetup';

jest.setTimeout(900_000);

const BRIDGE_AMOUNT = process.env.WAAS_TEST_BRIDGE_AMOUNT ?? '0.5';
const RUN_FUNDED_BRIDGE = process.env.WAAS_TEST_BRIDGE === 'true';

const USDC_BY_CHAIN: Record<number, string> = {
  137: '0x3c499c542cef5e3811e1192ce70d8cc03d5c3359',
  8453: '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913',
};

const WETH_BY_CHAIN: Record<number, string> = {
  137: '0x7ceB23fD6bC0adD59E62ac25578270cFf1b9f619',
  8453: '0x4200000000000000000000000000000000000006',
};

const SOLANA_USDC = 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v';

type BridgeResponse = {
  txHash: string;
  sourceTxHash: string;
  destTxHash: string;
  destinationTokenAmount: string;
};

describe('WAAS private bridge (integration)', () => {
  let ctx: WaasTestContext;
  let destChainId: number;

  beforeAll(async () => {
    ctx = await getWaasTestContext();
    destChainId = ctx.chainId === 8453 ? 137 : 8453;
    if (!USDC_BY_CHAIN[ctx.chainId]) throw new Error(`No USDC configured for source chain ${ctx.chainId}`);
  });

  const baseBody = () => ({
    organizationId: ctx.organizationId,
    userId: ctx.userId,
    fromAddress: ctx.evmAddress,
    amount: BRIDGE_AMOUNT,
    chainId: ctx.chainId,
  });

  it('rejects cross-chain bridge to a non-confidential-bridge chain', async () => {
    const { status, text } = await ctx.client.postRaw(
      '/waas/private-swap',
      {
        ...baseBody(),
        fromToken: USDC_BY_CHAIN[ctx.chainId],
        toToken: SOLANA_USDC,
        toChainId: chainIds.solanaMainnet,
      },
      ctx.userKp,
    );
    expect(status).toBe(400);
    expect(text).toMatch(/supported between these chains only/i);
  });

  it('rejects cross-chain bridge between different token symbols', async () => {
    const { status, text } = await ctx.client.postRaw(
      '/waas/private-swap',
      {
        ...baseBody(),
        fromToken: USDC_BY_CHAIN[ctx.chainId],
        toToken: WETH_BY_CHAIN[destChainId],
        toChainId: destChainId,
      },
      ctx.userKp,
    );
    expect(status).toBe(400);
    expect(text).toMatch(/same token only/i);
  });

  it('rejects same-chain swap of identical tokens', async () => {
    const { status, text } = await ctx.client.postRaw(
      '/waas/private-swap',
      {
        ...baseBody(),
        fromToken: USDC_BY_CHAIN[ctx.chainId],
        toToken: USDC_BY_CHAIN[ctx.chainId],
      },
      ctx.userKp,
    );
    expect(status).toBe(400);
    expect(text).toMatch(/must be different tokens/i);
  });

  it('rejects a bridge attempt without private balance', async () => {
    const { status, text } = await ctx.client.postRaw(
      '/waas/private-swap',
      {
        ...baseBody(),
        fromToken: USDC_BY_CHAIN[ctx.chainId],
        toToken: USDC_BY_CHAIN[destChainId],
        toChainId: destChainId,
      },
      ctx.userKp,
    );
    expect(status).toBeGreaterThanOrEqual(400);
    expect(text).toMatch(/insufficient/i);
  });

  (RUN_FUNDED_BRIDGE ? it : it.skip)('bridges USDC cross-chain and settles in the same request', async () => {
    const result = await ctx.client.postJson<BridgeResponse>(
      '/waas/private-swap',
      {
        ...baseBody(),
        fromToken: USDC_BY_CHAIN[ctx.chainId],
        toToken: USDC_BY_CHAIN[destChainId],
        toChainId: destChainId,
      },
      ctx.userKp,
    );

    expect(result.sourceTxHash).toMatch(/^0x/);
    expect(result.txHash).toBe(result.sourceTxHash);
    expect(result.destTxHash).toMatch(/^0x/);
    expect(BigInt(result.destinationTokenAmount ?? '0')).toBeGreaterThan(0n);
  });
});
