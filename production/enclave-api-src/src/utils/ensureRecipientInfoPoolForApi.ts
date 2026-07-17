import { hashEthereumAddress, isValidPrivateAddress, RECIPIENT_INFO_TARGET_POOL_SIZE } from '@hinkal/common';
import { hinkalInitializerService } from '../services/hinkalInitializerService';
import { PrivateSendRecipientInfoPool, RecipientInfoEntry } from '@hinkal/backend-common';

const refillRecipientInfoPool = (
  current: RecipientInfoEntry[],
  candidates: string[],
  targetCount: number,
): RecipientInfoEntry[] => {
  const availableCount = current.filter((item) => item.isAvailable).length;
  const missingCount = Math.max(0, targetCount - availableCount);

  if (missingCount === 0) return current;

  const existing = current.reduce((acc, item) => acc.add(item.privateAddress), new Set<string>());

  const uniqueCandidates = [...new Set(candidates)]
    .filter((item) => isValidPrivateAddress(item))
    .filter((item) => !existing.has(item))
    .slice(0, missingCount);

  const reduced = current.reduce(
    (acc, item) => {
      if (item.isAvailable || acc.remaining.length === 0) {
        return { entries: [...acc.entries, item], remaining: acc.remaining };
      }

      const [next, ...rest] = acc.remaining;
      return {
        entries: [...acc.entries, { privateAddress: next, isAvailable: true }],
        remaining: rest,
      };
    },
    { entries: [] as RecipientInfoEntry[], remaining: uniqueCandidates },
  );

  const appended = reduced.remaining.map((privateAddress) => ({ privateAddress, isAvailable: true }));

  return [...reduced.entries, ...appended];
};

export const ensureRecipientInfoPoolForApi = async (
  organizationId: string,
  userId: string,
  walletAddress: string,
  signerPublicKey: string,
  chainId: number,
): Promise<void> => {
  const recipientInfos = await hinkalInitializerService.withHinkalForOrganization(
    organizationId,
    userId,
    signerPublicKey,
    walletAddress,
    chainId,
    async (hinkal) => {
      return Array.from({ length: RECIPIENT_INFO_TARGET_POOL_SIZE }, () => hinkal.getRecipientInfo());
    },
    true,
  );

  const hashedEthereumAddress = hashEthereumAddress(walletAddress);

  const doc =
    (await PrivateSendRecipientInfoPool.findOne({ hashedEthereumAddress })) ??
    new PrivateSendRecipientInfoPool({ hashedEthereumAddress, recipientInfos: [] });

  doc.recipientInfos = refillRecipientInfoPool(doc.recipientInfos, recipientInfos, RECIPIENT_INFO_TARGET_POOL_SIZE);

  await doc.save();
};
