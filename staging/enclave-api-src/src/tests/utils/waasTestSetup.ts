import { ENCLAVE_API_URL } from '@hinkal/common';
import { WaasHttpClient } from './waasHttpClient';
import type { SignKeyPair } from './stamp';
import nacl from 'tweetnacl';
import { requireEnv } from '@hinkal/common/functions/utils/requireEnv';

export type WaasTestChain = 'arc' | 'polygon';

type ChainConfig = {
  chainId: number;
  usdcTokenAddress: string;
};

const ARC_TESTNET: ChainConfig = {
  chainId: 5042002,
  usdcTokenAddress: '0x3600000000000000000000000000000000000000',
};

const POLYGON_MAINNET: ChainConfig = {
  chainId: 137,
  usdcTokenAddress: '0x3c499c542cef5e3811e1192ce70d8cc03d5c3359',
};

const CHAIN_CONFIGS: Record<WaasTestChain, ChainConfig> = {
  arc: ARC_TESTNET,
  polygon: POLYGON_MAINNET,
};

const resolveTestChain = (): WaasTestChain => {
  const raw = requireEnv('WAAS_TEST_CHAIN').trim().toLowerCase();
  if (raw !== 'arc' && raw !== 'polygon') {
    throw new Error(`Invalid WAAS_TEST_CHAIN "${raw}": expected "arc" or "polygon"`);
  }
  return raw;
};

export type WaasTestContext = {
  client: WaasHttpClient;
  userKp: SignKeyPair;
  organizationId: string;
  userId: string;
  evmAddress: string;
  chainId: number;
  usdcTokenAddress: string;
};

let contextPromise: Promise<WaasTestContext> | null = null;

const keypairFromSeedHex = (seedHex: string): SignKeyPair => {
  const clean = seedHex.startsWith('0x') ? seedHex.slice(2) : seedHex;
  const seed = new Uint8Array(Buffer.from(clean, 'hex'));
  if (seed.length !== 32) {
    throw new Error('WAAS_TESTING_USER_PRIVATE_KEY_SEED_HEX must be 32 bytes (64 hex chars)');
  }
  return nacl.sign.keyPair.fromSeed(seed);
};

async function createWaasTestContext(): Promise<WaasTestContext> {
  const organizationId = requireEnv('WAAS_TESTING_ORGANIZATION_ID').trim();
  const userId = requireEnv('WAAS_TESTING_USER_ID').trim();
  const evmAddress = requireEnv('WAAS_TESTING_EVM_ADDRESS').trim();
  const userSeedHex = requireEnv('WAAS_TESTING_USER_PRIVATE_KEY_SEED_HEX').trim();
  const { chainId, usdcTokenAddress } = CHAIN_CONFIGS[resolveTestChain()];

  return {
    client: new WaasHttpClient(ENCLAVE_API_URL),
    userKp: keypairFromSeedHex(userSeedHex),
    organizationId,
    userId,
    evmAddress,
    chainId,
    usdcTokenAddress,
  };
}

export function getWaasTestContext(): Promise<WaasTestContext> {
  if (!contextPromise) {
    contextPromise = createWaasTestContext();
  }
  return contextPromise;
}
