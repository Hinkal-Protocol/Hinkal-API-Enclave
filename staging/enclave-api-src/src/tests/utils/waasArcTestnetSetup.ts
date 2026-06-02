import { ENCLAVE_API_URL, SCHEDULE_DELAY_OPTIONS, ScheduleDelayOption, WaasHttpClient } from '@hinkal/common';
import nacl, { SignKeyPair } from 'tweetnacl';
import { requireEnv } from '@hinkal/common/functions/utils/requireEnv';

/** Canonical USDC on Arc testnet (Circle / Arc docs). */
export const ARC_TESTNET_USDC = '0x3600000000000000000000000000000000000000';

/** Arc testnet chain id (same as `chainIds.arcTestnet` in app code). */
export const ARC_TESTNET_CHAIN_ID = 5042002;

export type WaasArcTestnetContext = {
  client: WaasHttpClient;
  userKp: SignKeyPair;
  organizationId: string;
  userId: string;
  evmAddress: string;
  txCompletionTime: number;
  chainId: number;
  usdcTokenAddress: string;
};

let contextPromise: Promise<WaasArcTestnetContext> | null = null;

const keypairFromSeedHex = (seedHex: string): SignKeyPair => {
  const clean = seedHex.startsWith('0x') ? seedHex.slice(2) : seedHex;
  const seed = new Uint8Array(Buffer.from(clean, 'hex'));
  if (seed.length !== 32) {
    throw new Error('WAAS_TESTING_USER_PRIVATE_KEY_SEED_HEX must be 32 bytes (64 hex chars)');
  }
  return nacl.sign.keyPair.fromSeed(seed);
};

async function createWaasArcTestnetContext(): Promise<WaasArcTestnetContext> {
  const organizationId = requireEnv('WAAS_TESTING_ORGANIZATION_ID').trim();
  const userId = requireEnv('WAAS_TESTING_USER_ID').trim();
  const evmAddress = requireEnv('WAAS_TESTING_EVM_ADDRESS').trim();
  const userSeedHex = requireEnv('WAAS_TESTING_USER_PRIVATE_KEY_SEED_HEX').trim();
  const txCompletionTime =
    Math.floor(Date.now() / 1000) + (SCHEDULE_DELAY_OPTIONS[ScheduleDelayOption.FIFTEEN_MINUTES] ?? 0);

  return {
    client: new WaasHttpClient(ENCLAVE_API_URL),
    userKp: keypairFromSeedHex(userSeedHex),
    organizationId,
    userId,
    evmAddress,
    txCompletionTime,
    chainId: ARC_TESTNET_CHAIN_ID,
    usdcTokenAddress: ARC_TESTNET_USDC,
  };
}

/**
 * Shared pre-funded Arc test account loaded from env.
 * Safe to call from multiple `beforeAll` hooks in the same Jest worker — shares one promise.
 */
export function getWaasArcTestnetContext(): Promise<WaasArcTestnetContext> {
  if (!contextPromise) {
    contextPromise = createWaasArcTestnetContext();
  }
  return contextPromise;
}
