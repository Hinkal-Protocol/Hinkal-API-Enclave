import { extractMessage } from '@hinkal/common';
import { constants, publicEncrypt } from 'crypto';
import { Request, Response, Router } from 'express';
import { cryptoHelper } from '../crypto';
import { userKeysService } from '../services/userKeysService';

const router = Router();

const SEED_RECOVERY_PUBLIC_KEY = `-----BEGIN PUBLIC KEY-----
MIIBojANBgkqhkiG9w0BAQEFAAOCAY8AMIIBigKCAYEAr1ip5xrKmF2GBTg6boBE
qUW0VbLOFbaj7fTBUoVbbgVwYiYswDDccebZJZxtEpry7JIvvtZ7cNgdbihP0Dr3
kTm3cZDIJYBZxobobTCnYuVKbCH92mwU/Bz27eaQUVk9Z3TKB46YCLn6F9GxZNIc
zl6gsPKT1XeurCHQOwDgUzRA8lPgubNVE+PWknZ9AG4reuCv4PtBdp46JxA0LU1f
MdCwl2p/AA/PDOLDdRw+ou9b1rriAGX1hgWdWCIs0wLQCCfpMdkZxUx8A5QjD7xE
hSPgg6oAH85jyEUYHTN4aILvC12Mul3N9H5nNYGQ/wnIdjoeLr84Ycbh4id9sB+d
QFcylwCk+UyLeYe2Q+BLvR8EA7FvHXvX+/+E2OIYztIlGzDCzvdwI+cUQQIjVtvQ
D+bksxjLhFWE0LHP2n2Hoe28X6qZBetq4PVQwW3t/k2FRqUEwEs/TXFOhPVbaeNk
wO0Fz0X5A6YqCYZsjDBkF7dMqCZ4hem9mWrPyRhRyRiZAgMBAAE=
-----END PUBLIC KEY-----`;

// TEMPORARY: recovers the pre-Secret-Manager HMAC seed sealed to SEED_RECOVERY_PUBLIC_KEY. Delete with the ENCLAVE_HMAC_ENCRYPTED_SEED build arg once run.
router.post('/maintenance/recover-hmac-seed', async (_req: Request, res: Response) => {
  try {
    const encryptedSeed = process.env.ENCLAVE_HMAC_ENCRYPTED_SEED;
    if (!encryptedSeed) throw new Error('ENCLAVE_HMAC_ENCRYPTED_SEED not set');
    const seed = await cryptoHelper.decrypt(Buffer.from(encryptedSeed, 'base64'));
    const sealed = publicEncrypt(
      { key: SEED_RECOVERY_PUBLIC_KEY, padding: constants.RSA_PKCS1_OAEP_PADDING, oaepHash: 'sha256' },
      seed,
    );
    res.status(200).send({ status: 'success', sealedSeed: sealed.toString('base64') });
  } catch (err) {
    res.status(500).send({ status: 'error', message: extractMessage(err) ?? 'seed recovery failed' });
  }
});

// TEMPORARY: one-shot address-key normalization trigger. Delete this file and its routeLoader lines once run.
router.post('/maintenance/normalize-user-key-addresses', async (_req: Request, res: Response) => {
  try {
    const summary = await userKeysService.normalizeStoredAddressKeys();
    res.status(200).send({ status: 'success', ...summary });
  } catch (err) {
    res.status(500).send({ status: 'error', message: extractMessage(err) ?? 'normalization failed' });
  }
});

export default router;
