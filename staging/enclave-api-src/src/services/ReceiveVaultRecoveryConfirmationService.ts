import { getErc20TokenFromAPI, Logger } from '@hinkal/common';
import {
  PendingReceiveVaultRecovery,
  PendingReceiveVaultRecoveryModel,
} from '../models/PendingReceiveVaultRecoverySchema';
import { emitReferralVolume } from '../utils/emitReferralVolume';
import { verifyRawDoc } from '../utils/documentSigning';
import { OWN_DEPLOYMENT_MATCH } from '../constants';

const LABEL = 'pending receive vault recovery';

export const confirmPendingReceiveVaultRecovery = async (
  chainId: number,
  vaultAddress: string,
  tokenAddress: string,
  txHash: string,
  amount: bigint,
): Promise<void> => {
  const raw = await PendingReceiveVaultRecoveryModel.findOneAndDelete({
    chainId,
    vaultAddress,
    tokenAddress,
    ...OWN_DEPLOYMENT_MATCH,
  }).lean();
  if (!raw) return;

  let pending: PendingReceiveVaultRecovery;
  try {
    pending = (await verifyRawDoc(
      raw as unknown as Record<string, unknown>,
      LABEL,
    )) as unknown as PendingReceiveVaultRecovery;
  } catch (err) {
    Logger.error(`[ReceiveVaultRecoveryConfirmationService] integrity check failed for vault=${vaultAddress}:`, err);
    return;
  }

  if (!pending.ref) return;

  const token = await getErc20TokenFromAPI(chainId, tokenAddress);
  if (!token) {
    Logger.error(`[ReceiveVaultRecoveryConfirmationService] unresolved token ${tokenAddress} on chain ${chainId}`);
    return;
  }

  emitReferralVolume(pending.ref, chainId, txHash, [token], [amount.toString()], 0n);
};
