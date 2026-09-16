import { getERC20Token } from '@hinkal/erc20-registry';
import { constructAdminData, emitTxPublicData, ERC20Token, Logger } from '@hinkal/common';
import { PendingDepositConfirmation, PendingDepositConfirmationModel } from '../models/PendingDepositReferralSchema';
import { emitReferralVolume } from '../utils/emitReferralVolume';
import { verifyRawDoc } from '../utils/documentSigning';

const LABEL = 'pending deposit confirmation';

export const confirmPendingDeposit = async (orderId: string, chainId: number, txHash: string): Promise<void> => {
  const raw = await PendingDepositConfirmationModel.findOneAndDelete({ orderId, chainId }).lean();
  if (!raw) return;

  let pending: PendingDepositConfirmation;
  try {
    pending = (await verifyRawDoc(
      raw as unknown as Record<string, unknown>,
      LABEL,
    )) as unknown as PendingDepositConfirmation;
  } catch (err) {
    Logger.error(`[DepositReferralConfirmationService] integrity check failed for orderId=${orderId}:`, err);
    return;
  }

  const tokens = pending.tokenAddresses.map((address) => getERC20Token(address, chainId));
  if (tokens.some((token): token is undefined => !token)) {
    Logger.error(`[DepositReferralConfirmationService] unresolved token for orderId=${orderId}`);
    return;
  }

  const amountChanges = pending.amounts.map(BigInt);
  const adminData = constructAdminData(
    pending.action,
    chainId,
    pending.tokenAddresses,
    amountChanges,
    pending.ethereumAddress,
  );
  emitTxPublicData(adminData);

  emitReferralVolume(pending.ref, chainId, txHash, tokens as ERC20Token[], pending.amounts, 0n);
};
