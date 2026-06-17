import { requireEnv } from '@hinkal/common';
import type { CryptoMode } from './types';

export const PORT = requireEnv('PORT');
export const DB_URI_ENCRYPTED = requireEnv('DB_URI_ENCRYPTED');

export enum EnclaveSessionAccess {
  Read = 'read',
  Write = 'write',
}

// buildEnclaveSignMessage
export const buildEnclaveSignMessage = (
  sessionId: string,
  access: EnclaveSessionAccess = EnclaveSessionAccess.Read,
): string => {
  const lines = ['Authorize Hinkal session', `Session ID: ${sessionId}`];

  if (access === EnclaveSessionAccess.Write) {
    lines.push('This signature can also be used to submit transactions.');
  }

  return lines.join('\n');
};

export const { DEPLOYMENT_MODE } = process.env;

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
