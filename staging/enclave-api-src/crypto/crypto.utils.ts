export const stripPemToBase64Der = (pem: string): string =>
  pem.replace('-----BEGIN PUBLIC KEY-----', '').replace('-----END PUBLIC KEY-----', '').replace(/\n/g, '').trim();
