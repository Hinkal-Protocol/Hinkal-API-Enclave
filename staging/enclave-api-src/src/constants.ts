import { requireEnv } from '@hinkal/common';
import type { CryptoMode } from './types';

export const PORT = requireEnv('PORT');
export const MONGODB_URL = requireEnv('MONGODB_URL');
export const ENCLAVE_API_HMAC_SEED = requireEnv('ENCLAVE_API_HMAC_SEED');
export const HENCLAVE_HMAC_SEED = requireEnv('HENCLAVE_HMAC_SEED');
export const PARTNER_INTERNAL_KEY = requireEnv('PARTNER_INTERNAL_KEY');

export const HEADER_ENCLAVE_SIGNATURE = 'x-hinkal-response-signature';

export const MONGO_DUPLICATE_KEY_ERROR = 11000;

export const DEPLOYMENT_MODE = requireEnv('DEPLOYMENT_MODE');

export const OWN_DEPLOYMENT_MATCH = { $or: [{ deploymentMode: DEPLOYMENT_MODE }, { deploymentMode: null }] };

const CRYPTO_MODE_BY_DEPLOYMENT: Record<string, CryptoMode> = {
  development: 'local',
  staging: 'kms',
  production: 'kms',
};

export const CRYPTO_MODE: CryptoMode = CRYPTO_MODE_BY_DEPLOYMENT[DEPLOYMENT_MODE ?? ''] ?? 'local';

export const isLocalCryptoMode = CRYPTO_MODE === 'local';

const requireEnvWhenKms = (name: string): string => {
  if (isLocalCryptoMode) return '';
  return requireEnv(name);
};

const parseLocalPrivateKeyPem = (value: string): string => {
  const trimmed = value.trim();
  if (trimmed.startsWith('-----BEGIN')) {
    return trimmed.replace(/\\n/g, '\n');
  }
  return Buffer.from(trimmed, 'base64').toString('utf8').trim();
};

export const LOCAL_RSA_PRIVATE_KEY_PEM = isLocalCryptoMode
  ? parseLocalPrivateKeyPem(requireEnv('LOCAL_RSA_PRIVATE_KEY_PEM'))
  : '';

export const GCP_PROJECT_ID = requireEnvWhenKms('GCP_PROJECT_ID');
export const GCP_REGION = requireEnvWhenKms('GCP_REGION');
export const KMS_KEY_RING_ID = requireEnvWhenKms('KMS_KEY_RING');
export const KMS_KEY_ID = requireEnvWhenKms('KMS_KEY_NAME');
export const KMS_KEY_VERSION = process.env.KMS_KEY_VERSION ?? '1';
export const WIF_AUDIENCE = requireEnvWhenKms('WIF_AUDIENCE');
export const ENCLAVE_UTXO_PRIVATE_KEY = requireEnvWhenKms('ENCLAVE_UTXO_PRIVATE_KEY');
export const DATA_SERVER_SERVICE_KEY = process.env.DATA_SERVER_SERVICE_KEY ?? '';
export const UTXO_SERVER_HOST = process.env.UTXO_SERVER_HOST ?? '127.0.0.1';
export const UTXO_SERVER_PORT = Number(process.env.UTXO_SERVER_PORT ?? 7000);

export const PARTNER_KEY_MARKER = 'hk_';
export const PARTNER_KEY_CACHE_TTL_MS = 60 * 1000;
export const PARTNER_KEY_CACHE_MAX_ENTRIES = 5000;
export const DATA_SERVER_INTERNAL_TIMEOUT_MS = 5000;
export const DATA_SERVER_REFERRAL_TX_TIMEOUT_MS = 4 * 60 * 1000;
export const SCHEDULE_ID_PATTERN = /^[0-9a-f]{24}$/;
