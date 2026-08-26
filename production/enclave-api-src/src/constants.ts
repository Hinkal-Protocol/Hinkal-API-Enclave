import { requireEnv } from '@hinkal/common';
import type { CryptoMode } from './types';

export const PORT = requireEnv('PORT');
export const DB_URI_ENCRYPTED = requireEnv('DB_URI_ENCRYPTED');

export const HEADER_ENCLAVE_SIGNATURE = 'x-hinkal-response-signature';

export const MONGO_DUPLICATE_KEY_ERROR = 11000;

export const DEPLOYMENT_MODE = requireEnv('DEPLOYMENT_MODE');

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
export const ENCLAVE_SA_EMAIL = requireEnvWhenKms('ENCLAVE_SA_EMAIL');
export const ENCLAVE_UTXO_PRIVATE_KEY_ENCRYPTED = requireEnvWhenKms('ENCLAVE_UTXO_PRIVATE_KEY_ENCRYPTED');
