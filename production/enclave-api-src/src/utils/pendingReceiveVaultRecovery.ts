import { PendingReceiveVaultRecoveryModel } from '../models/PendingReceiveVaultRecoverySchema';
import { sealDocument } from './documentSigning';

export const createPendingReceiveVaultRecovery = async (
  chainId: number,
  vaultAddress: string,
  tokenAddress: string,
  recipientAddress: string,
  expectedAmount: bigint,
  createdAtBlock: number,
  ref: string | undefined,
): Promise<void> => {
  const sealed = await sealDocument({
    chainId,
    vaultAddress,
    tokenAddress,
    recipientAddress,
    expectedAmount: expectedAmount.toString(),
    createdAtBlock,
    createdAt: new Date(),
    ...(ref !== undefined && { ref }),
  });

  await PendingReceiveVaultRecoveryModel.findOneAndUpdate({ chainId, vaultAddress, tokenAddress }, sealed, {
    upsert: true,
  });
};
