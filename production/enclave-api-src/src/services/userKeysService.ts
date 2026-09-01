import { extractMessage, generateHashFromSeedPhrases, Logger, WalletManager } from '@hinkal/common';
import { getAddress, isAddress } from 'ethers';
import { MONGO_DUPLICATE_KEY_ERROR } from '../constants';
import { UserKeysModel } from '../models/UserKeysSchema';
import { cryptoHelper } from '../crypto';
import { assertString } from '../utils/queryGuards';
import { replaceSignedDoc, sealDocument, toRecord, verifyRawDoc } from '../utils/documentSigning';

const USER_KEYS_INTEGRITY_LABEL = 'user-keys';

export type AddressKeyMigrationSummary = { scanned: number; stale: number; normalized: number; failed: number };

// EVM auth is case-insensitive, so the store key must be canonical. Tron/Solana are case-sensitive: leave untouched.
const canonicalAddressKey = (address: string): string => (isAddress(address) ? getAddress(address) : address);

class UserKeysService {
  public async findByEthereumAddress(ethereumAddress: string) {
    const record = await UserKeysModel.findOne({
      ethereumAddress: canonicalAddressKey(assertString(ethereumAddress, 'ethereumAddress')),
    }).lean();
    if (!record) return null;
    const verified = await verifyRawDoc(toRecord(record), USER_KEYS_INTEGRITY_LABEL);
    if (!verified) return null;
    const decrypted = await cryptoHelper.decrypt(Buffer.from(verified.encryptedSignature as string, 'base64'));
    return decrypted.toString('utf8');
  }

  public async createAndStorePrivateKey(ethereumAddress: string) {
    const mnemonic = new WalletManager().generateMnemonic();
    const mnemonicPhrase = mnemonic.join(' ');
    const signature = generateHashFromSeedPhrases(mnemonic);
    const [encryptedMnemonic, encryptedSignature] = await Promise.all([
      cryptoHelper.encrypt(Buffer.from(mnemonicPhrase, 'utf8')),
      cryptoHelper.encrypt(Buffer.from(signature, 'utf8')),
    ]);

    const sealed = await sealDocument({
      ethereumAddress: canonicalAddressKey(ethereumAddress),
      encryptedMnemonic: encryptedMnemonic.toString('base64'),
      encryptedSignature: encryptedSignature.toString('base64'),
    });
    await UserKeysModel.create(sealed);

    return signature;
  }

  /** Re-keys pre-normalization records onto their canonical address. Idempotent: runs at boot and on demand. */
  public async normalizeStoredAddressKeys(): Promise<AddressKeyMigrationSummary> {
    const records = await UserKeysModel.find({}).lean();
    const stale = records.filter((record) => canonicalAddressKey(record.ethereumAddress) !== record.ethereumAddress);
    if (stale.length === 0) return { scanned: records.length, stale: 0, normalized: 0, failed: 0 };

    const normalized = await stale.reduce<Promise<number>>(async (running, record) => {
      const count = await running;
      const canonical = canonicalAddressKey(record.ethereumAddress);
      try {
        await verifyRawDoc(toRecord(record), USER_KEYS_INTEGRITY_LABEL);
        await replaceSignedDoc(UserKeysModel.collection, record, { ethereumAddress: canonical });
        return count + 1;
      } catch (err) {
        if ((err as { code?: number })?.code === MONGO_DUPLICATE_KEY_ERROR) {
          const owner = await UserKeysModel.findOne({ ethereumAddress: canonical }).select('_id').lean();
          Logger.error(
            `[userKeys] address collision: doc ${record._id} (${record.ethereumAddress}) cannot normalize to ` +
              `${canonical} — already owned by doc ${owner?._id ?? 'unknown'}. Left un-normalized; needs manual reconciliation.`,
          );
        } else {
          Logger.error(
            `[userKeys] failed to normalize doc ${record._id} (${record.ethereumAddress}):`,
            extractMessage(err) ?? err,
          );
        }
        return count;
      }
    }, Promise.resolve(0));

    Logger.log(`[userKeys] normalized ${normalized} of ${stale.length} address keys`);
    return { scanned: records.length, stale: stale.length, normalized, failed: stale.length - normalized };
  }

  public async findOrCreatePrivateKey(ethereumAddress: string) {
    const existing = await this.findByEthereumAddress(ethereumAddress);
    if (existing) return existing;

    try {
      return await this.createAndStorePrivateKey(ethereumAddress);
    } catch (err: unknown) {
      if ((err as { code?: number })?.code !== MONGO_DUPLICATE_KEY_ERROR) throw err;

      // It is possible that other request created the key after we checked for it, so we need to check again before throwing the error.
      const createdByOtherRequest = await this.findByEthereumAddress(ethereumAddress);
      if (!createdByOtherRequest) throw err;
      return createdByOtherRequest;
    }
  }
}

export const userKeysService = new UserKeysService();
