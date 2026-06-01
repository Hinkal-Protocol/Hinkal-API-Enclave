import nacl from 'tweetnacl';

export type SignKeyPair = nacl.SignKeyPair;

export const bytesToHex = (bytes: Uint8Array): string => Buffer.from(bytes).toString('hex');

/**
 * Same canonical string as `xStampMiddleware`: signature is over UTF-8 bytes of
 * `JSON.stringify(Object.entries(params))` (including `nonce`).
 */
export const buildXStamp = (params: Record<string, unknown>, keypair: SignKeyPair): string => {
  const canonical = JSON.stringify(Object.entries(params));
  const sigBytes = nacl.sign.detached(Buffer.from(canonical, 'utf8'), keypair.secretKey);
  const json = JSON.stringify({
    publicKey: bytesToHex(keypair.publicKey),
    signature: bytesToHex(sigBytes),
  });
  return Buffer.from(json).toString('base64url');
};
