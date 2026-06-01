import { ethers } from 'ethers';
import { generateHashFromSeedPhrases } from '@hinkal/common';
import mongoose from 'mongoose';
import { userKeysService } from '../../services/userKeysService';
import { UserKeysModel } from '../../models/UserKeysSchema';
import { cryptoHelper } from '../../crypto';

const randomAddress = () => ethers.Wallet.createRandom().address;

beforeAll(async () => {
  await mongoose.connect(process.env.DB_URI!);
});

afterAll(async () => {
  await mongoose.disconnect();
});

describe('userKeysService', () => {
  describe('createAndStorePrivateKey', () => {
    it('returns seed phrase hash signature and persists mnemonic and signature encrypted', async () => {
      const address = randomAddress();
      const signature = await userKeysService.createAndStorePrivateKey(address);

      const record = await UserKeysModel.findOne({ ethereumAddress: address });
      expect(record).not.toBeNull();
      expect(record!.encryptedSignature).not.toBe(signature);

      const mnemonic = (await cryptoHelper.decrypt(Buffer.from(record!.encryptedMnemonic, 'base64'))).toString('utf8');
      const decryptedSignature = (
        await cryptoHelper.decrypt(Buffer.from(record!.encryptedSignature, 'base64'))
      ).toString('utf8');

      expect(decryptedSignature).toBe(signature);
      expect(generateHashFromSeedPhrases(mnemonic.split(' '))).toBe(signature);
    });
  });

  describe('findByEthereumAddress', () => {
    it('returns null when address is not in db', async () => {
      const result = await userKeysService.findByEthereumAddress(randomAddress());
      expect(result).toBeNull();
    });

    it('returns the original signature after create', async () => {
      const address = randomAddress();
      const created = await userKeysService.createAndStorePrivateKey(address);
      const found = await userKeysService.findByEthereumAddress(address);
      expect(found).toBe(created);
    });
  });
});
