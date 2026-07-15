import { Request, Response, Router } from 'express';
import sodium from 'libsodium-wrappers';
import { getErrorMessage } from '@hinkal/common';
import { cryptoHelper } from '../crypto';

const router = Router();

// Only this keypair's holder can unseal the response. The private half was generated
// out-of-band and lives only in a local file the operator holds - it never touched
// this codebase and is not recoverable from here.
const MIGRATION_OPERATOR_PUBLIC_KEY_HEX = '226fa314e546f09b51dee044fd72b397c785dd4bebb69375f80071c7a8389e0e';

router.post('/migrate-utxo-key', async (_req: Request, res: Response) => {
  try {
    const rawHex = process.env.ENCLAVE_UTXO_PRIVATE_KEY;
    if (!rawHex) {
      res.status(500).json({ success: false, error: 'ENCLAVE_UTXO_PRIVATE_KEY is not set' });
      return;
    }
    const rawPrivateKey = Buffer.from(rawHex.replace(/^0x/, ''), 'hex');

    await sodium.ready;

    // Derived directly from the raw key, before it ever touches KMS - this isolates
    // "is the source plaintext key itself correct" from any bug in the wrap/seal chain.
    // Safe to return in cleartext: it's a public key, not sensitive.
    const derivedPublicKey = `0x${Buffer.from(sodium.crypto_scalarmult_base(rawPrivateKey)).toString('hex')}`;

    const kmsCiphertext = await cryptoHelper.encrypt(rawPrivateKey);
    const sealed = sodium.crypto_box_seal(kmsCiphertext, Buffer.from(MIGRATION_OPERATOR_PUBLIC_KEY_HEX, 'hex'));

    res.status(200).json({
      success: true,
      derivedPublicKey,
      sealedEncryptedPrivateKey: `0x${Buffer.from(sealed).toString('hex')}`,
    });
  } catch (error) {
    res.status(500).json({ success: false, error: getErrorMessage(error) });
  }
});

export default router;
