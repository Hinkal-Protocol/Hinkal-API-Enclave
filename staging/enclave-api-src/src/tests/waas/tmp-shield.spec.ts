import { getWaasTestContext, type WaasTestContext } from '../utils/waasTestSetup';

jest.setTimeout(600_000);

const SHIELD_AMOUNT = process.env.TMP_SHIELD_AMOUNT ?? '0.5';

describe('tmp shield', () => {
  let ctx: WaasTestContext;

  beforeAll(async () => {
    ctx = await getWaasTestContext();
  });

  it('shields USDC into the private balance', async () => {
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
    // eslint-disable-next-line no-console
    console.log('shield txHash', txHash);
    expect(txHash).toMatch(/^0x/);
  });
});
