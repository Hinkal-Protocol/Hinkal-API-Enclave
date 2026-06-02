import { ethers } from 'ethers';
import { getUtxosFromEnclave, preProcessing, waitForEthereumTransactionConfirmation, waitLittle } from '@hinkal/common';
import { getWaasArcTestnetContext, type WaasArcTestnetContext } from '../utils/waasArcTestnetSetup';
import { BalanceRow, getBalanceForToken, toUnits, USDC_DECIMALS } from '../utils/waasBalanceHelpers';

const TX_AMOUNT = '0.01';
const SHIELD_AMOUNT = '1';
const UNSHIELD_AMOUNT = '0.001';
const ZERO_ADDRESS = '0x0000000000000000000000000000000000000000';
const HINKAL_SIGNING_MESSAGE = 'Login to Hinkal Protocol';

async function expectClaimableUtxoInEnclave(
  recipient: ethers.HDNodeWallet,
  chainId: number,
  tokenAddress: string,
  expectedAmountWei: bigint,
): Promise<void> {
  const signature = await recipient.signMessage(HINKAL_SIGNING_MESSAGE);

  let match: { amount: string; erc20TokenAddress: string } | undefined;
  for (let attempt = 0; attempt < 18; attempt += 1) {
    // eslint-disable-next-line no-await-in-loop
    const utxos = await getUtxosFromEnclave(recipient.address, signature, chainId, false);
    match = utxos.find(
      (u) => u.erc20TokenAddress.toLowerCase() === tokenAddress.toLowerCase() && BigInt(u.amount) === expectedAmountWei,
    );
    if (match) break;
    // eslint-disable-next-line no-await-in-loop
    await waitLittle(5_000);
  }

  expect(match).toBeDefined();
}

async function getPublicBalanceRows(ctx: WaasArcTestnetContext) {
  return ctx.client.getJson<BalanceRow[]>(
    '/waas/public-balance',
    {
      walletAddress: ctx.evmAddress,
      chainId: String(ctx.chainId),
    },
    ctx.userKp,
  );
}

async function getPrivateBalanceRows(ctx: WaasArcTestnetContext) {
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

describe('WAAS Arc testnet E2E (EVM)', () => {
  jest.setTimeout(300_000);

  let ctx: WaasArcTestnetContext;

  beforeAll(async () => {
    await preProcessing();
    ctx = await getWaasArcTestnetContext();
  }, 600_000);

  describe('transaction routes (EVM)', () => {
    it('public-to-public', async () => {
      const publicBefore = getBalanceForToken(await getPublicBalanceRows(ctx), ctx.usdcTokenAddress);
      const { txHash } = await ctx.client.postJson<{ txHash: string }>(
        '/waas/public-to-public',
        {
          organizationId: ctx.organizationId,
          userId: ctx.userId,
          fromAddress: ctx.evmAddress,
          to: ctx.evmAddress,
          txCompletionTime: ctx.txCompletionTime,
          token: ctx.usdcTokenAddress,
          amount: TX_AMOUNT,
          chainId: ctx.chainId,
        },
        ctx.userKp,
      );
      await waitForEthereumTransactionConfirmation(ctx.chainId, txHash);
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

    it('public-to-private falls back to a claimable UTXO for an unregistered recipient', async () => {
      const recipient = ethers.Wallet.createRandom();
      const publicBefore = getBalanceForToken(await getPublicBalanceRows(ctx), ctx.usdcTokenAddress);
      const { txHash } = await ctx.client.postJson<{ txHash: string }>(
        '/waas/public-to-private',
        {
          organizationId: ctx.organizationId,
          userId: ctx.userId,
          fromAddress: ctx.evmAddress,
          to: recipient.address,
          token: ctx.usdcTokenAddress,
          amount: SHIELD_AMOUNT,
          chainId: ctx.chainId,
        },
        ctx.userKp,
      );
      expect(txHash).toBeTruthy();
      await waitForEthereumTransactionConfirmation(ctx.chainId, txHash);
      const publicAfter = getBalanceForToken(await getPublicBalanceRows(ctx), ctx.usdcTokenAddress);
      expect(publicAfter < publicBefore).toBe(true);

      await expectClaimableUtxoInEnclave(
        recipient,
        ctx.chainId,
        ctx.usdcTokenAddress,
        toUnits(SHIELD_AMOUNT, USDC_DECIMALS),
      );
    });

    it.only('private-to-private falls back to a claimable UTXO for an unregistered recipient', async () => {
      const recipient = ethers.Wallet.createRandom();
      const privateBefore = getBalanceForToken(await getPrivateBalanceRows(ctx), ctx.usdcTokenAddress);
      const { txHash } = await ctx.client.postJson<{ txHash: string }>(
        '/waas/private-to-private',
        {
          organizationId: ctx.organizationId,
          userId: ctx.userId,
          fromAddress: ctx.evmAddress,
          to: recipient.address,
          token: ctx.usdcTokenAddress,
          amount: UNSHIELD_AMOUNT,
          chainId: ctx.chainId,
        },
        ctx.userKp,
      );
      expect(txHash).toBeTruthy();
      await waitForEthereumTransactionConfirmation(ctx.chainId, txHash);
      const privateAfter = getBalanceForToken(await getPrivateBalanceRows(ctx), ctx.usdcTokenAddress);
      expect(privateAfter < privateBefore).toBe(true);

      await expectClaimableUtxoInEnclave(
        recipient,
        ctx.chainId,
        ctx.usdcTokenAddress,
        toUnits(UNSHIELD_AMOUNT, USDC_DECIMALS),
      );
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

  describe('claim-utxo route (EVM)', () => {
    const sampleUtxo = () => ({
      amount: '1000000',
      randomization: '42',
      stealthAddress: '0x1111111111111111111111111111111111111111',
      shieldedPrivateKey: '0x2222222222222222222222222222222222222222222222222222222222222222',
      erc20TokenAddress: ctx.usdcTokenAddress,
      timeStamp: '0',
      tokenId: 0,
    });

    it('rejects a request with no utxo', async () => {
      const res = await ctx.client.postRaw(
        '/waas/claim-utxo',
        {
          organizationId: ctx.organizationId,
          userId: ctx.userId,
          fromAddress: ctx.evmAddress,
          token: ctx.usdcTokenAddress,
          chainId: ctx.chainId,
        },
        ctx.userKp,
      );
      expect(res.status).toBe(400);
    });

    it('rejects a utxo missing required fields', async () => {
      const incompleteUtxo = sampleUtxo();
      delete (incompleteUtxo as Partial<ReturnType<typeof sampleUtxo>>).shieldedPrivateKey;
      const res = await ctx.client.postRaw(
        '/waas/claim-utxo',
        {
          organizationId: ctx.organizationId,
          userId: ctx.userId,
          fromAddress: ctx.evmAddress,
          token: ctx.usdcTokenAddress,
          chainId: ctx.chainId,
          utxo: incompleteUtxo,
        },
        ctx.userKp,
      );
      expect(res.status).toBe(400);
    });
  });

  describe('bridge route (EVM)', () => {
    const SOLANA_CHAIN_ID = 501;
    const OPTIMISM_CHAIN_ID = 10;
    const POLYGON_CHAIN_ID = 137;
    const OPTIMISM_USDC = '0x0b2C639c533813f4Aa9D7837CAf62653d097Ff85';

    const baseBridgeBody = () => ({
      organizationId: ctx.organizationId,
      userId: ctx.userId,
      fromAddress: ctx.evmAddress,
      to: ctx.evmAddress,
      token: ctx.usdcTokenAddress,
      amount: TX_AMOUNT,
      chainId: ctx.chainId,
      destinationChainId: ctx.chainId + 1,
    });

    it('rejects missing destinationChainId', async () => {
      const body = baseBridgeBody();
      delete (body as Partial<typeof body>).destinationChainId;
      const res = await ctx.client.postRaw('/waas/bridge', body, ctx.userKp);
      expect(res.status).toBe(400);
    });

    it('rejects same source and destination chain', async () => {
      const res = await ctx.client.postRaw(
        '/waas/bridge',
        { ...baseBridgeBody(), destinationChainId: ctx.chainId },
        ctx.userKp,
      );
      expect(res.status).toBe(400);
    });

    it('rejects non-EVM destination chain', async () => {
      const res = await ctx.client.postRaw(
        '/waas/bridge',
        { ...baseBridgeBody(), destinationChainId: SOLANA_CHAIN_ID },
        ctx.userKp,
      );
      expect(res.status).toBe(400);
    });

    it('bridges Optimism to Polygon', async () => {
      const getOptimismBalance = async () =>
        getBalanceForToken(
          await ctx.client.getJson<BalanceRow[]>(
            '/waas/public-balance',
            { walletAddress: ctx.evmAddress, chainId: String(OPTIMISM_CHAIN_ID) },
            ctx.userKp,
          ),
          OPTIMISM_USDC,
        );

      const publicBefore = await getOptimismBalance();
      const { txHash } = await ctx.client.postJson<{ txHash: string }>(
        '/waas/bridge',
        {
          ...baseBridgeBody(),
          token: OPTIMISM_USDC,
          chainId: OPTIMISM_CHAIN_ID,
          destinationChainId: POLYGON_CHAIN_ID,
        },
        ctx.userKp,
      );
      expect(txHash).toBeTruthy();
      await waitForEthereumTransactionConfirmation(OPTIMISM_CHAIN_ID, txHash);
      const publicAfter = await getOptimismBalance();
      expect(publicAfter < publicBefore).toBe(true);
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
          message: 'Hello from WAAS Arc E2E',
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
          token: ZERO_ADDRESS,
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
