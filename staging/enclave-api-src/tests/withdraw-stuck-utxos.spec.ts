import { ethers } from 'ethers';
import { ARC_TESTNET_USDC_ADDRESS, chainIds, getPublicBalanceByTokenAddress } from '@hinkal/common';
import { createJsonRpcProvider } from '@hinkal/common/functions/utils/create-provider';
import { requireEnv } from '@hinkal/common/functions/utils/requireEnv';
import { createEnclaveSession } from './utils/enclaveAuthHelper';
import { getStuckUtxoBalance, withdrawStuckUtxos } from './utils/enclaveIntegrationHelpers';

const CHAIN_ID = chainIds.arcTestnet;

let wallet: ethers.Wallet;

beforeAll(() => {
  const provider = createJsonRpcProvider(CHAIN_ID);
  wallet = new ethers.Wallet(requireEnv('ENCLAVE_TESTING_PRIVATE_KEY'), provider);
});

describe('GET /stuck-utxo-balance', () => {
  jest.setTimeout(60_000);

  it('returns a valid balance (zero or positive) for USDC', async () => {
    const authFields = await createEnclaveSession(wallet, CHAIN_ID);
    const balance = await getStuckUtxoBalance(wallet, CHAIN_ID, ARC_TESTNET_USDC_ADDRESS, authFields);
    expect(balance >= 0n).toBe(true);
  });
});

describe('POST /withdraw-stuck-utxos', () => {
  jest.setTimeout(300_000);

  it('withdraws any stuck USDC UTXOs to recipient and verifies balance clears', async () => {
    const authFields = await createEnclaveSession(wallet, CHAIN_ID);
    const stuckBefore = await getStuckUtxoBalance(wallet, CHAIN_ID, ARC_TESTNET_USDC_ADDRESS, authFields);
    const recipientAddress = wallet.address;
    const recipientPublicBefore =
      (await getPublicBalanceByTokenAddress(CHAIN_ID, recipientAddress, ARC_TESTNET_USDC_ADDRESS)) ?? 0n;

    const txHashes = await withdrawStuckUtxos(wallet, CHAIN_ID, ARC_TESTNET_USDC_ADDRESS, recipientAddress);

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
