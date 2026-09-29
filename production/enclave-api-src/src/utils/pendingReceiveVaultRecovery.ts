import { PendingReceiveVaultRecoveryModel } from '../models/PendingReceiveVaultRecoverySchema';
import { ReferralAttribution } from '../types';
import { sealDocument } from './documentSigning';
import { DEPLOYMENT_MODE } from '../constants';

export const createPendingReceiveVaultRecovery = async (
  chainId: number,
  vaultAddress: string,
  tokenAddress: string,
  recipientAddress: string,
  expectedAmount: bigint,
  createdAtBlock: number,
  { ref, keyId }: ReferralAttribution,
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
    ...(keyId !== undefined && { keyId }),
  });

  await PendingReceiveVaultRecoveryModel.findOneAndReplace({ chainId, vaultAddress, tokenAddress }, sealed, {
    upsert: true,
  });
};
