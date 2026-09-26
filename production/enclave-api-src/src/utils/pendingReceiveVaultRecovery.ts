import { PendingReceiveVaultRecoveryModel } from '../models/PendingReceiveVaultRecoverySchema';
import { sealDocument } from './documentSigning';
import { DEPLOYMENT_MODE } from '../constants';

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
    deploymentMode: DEPLOYMENT_MODE,
    ...(ref !== undefined && { ref }),
  });

  await PendingReceiveVaultRecoveryModel.findOneAndUpdate({ chainId, vaultAddress, tokenAddress }, sealed, {
    upsert: true,
  });
};
