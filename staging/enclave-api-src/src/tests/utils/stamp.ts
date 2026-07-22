import nacl from 'tweetnacl';
import { buildActionBinding } from '@hinkal/common';
import { buildStampMessage } from '../../utils/requestBinding';

export type SignKeyPair = nacl.SignKeyPair;

export const bytesToHex = (bytes: Uint8Array): string => Buffer.from(bytes).toString('hex');

/**
 * Same canonical string as `xStampMiddleware`: signature is over UTF-8 bytes of
 * the action binding ("METHOD /route") plus `JSON.stringify(Object.entries(params))`
 * (including `nonce`).
 */
export const buildXStamp = (
  method: string,
  routePath: string,
  params: Record<string, unknown>,
  keypair: SignKeyPair,
): string => {
  const canonical = buildStampMessage(buildActionBinding(method, routePath), params);
  const sigBytes = nacl.sign.detached(Buffer.from(canonical, 'utf8'), keypair.secretKey);
  const json = JSON.stringify({
    publicKey: bytesToHex(keypair.publicKey),
    signature: bytesToHex(sigBytes),
  });
  return Buffer.from(json).toString('base64url');
};
