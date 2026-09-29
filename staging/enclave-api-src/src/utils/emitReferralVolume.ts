import {
  emitReferralTx,
  ERC20Token,
  getAmountInToken,
  getErrorMessage,
  Logger,
  PartnerTransactionType,
} from '@hinkal/common';
import { PartnerReferralTxRequest } from '@hinkal/backend-common';
import { ReferralAttribution } from '../types';
import { emitPartnerReferralTx } from './dataServerInternal';

const sendPartnerReferralTx = async (payload: PartnerReferralTxRequest) => {
  try {
    await emitPartnerReferralTx(payload);
  } catch (err) {
    Logger.error(
      'failed to emit partner referral tx:',
      { ref: payload.ref, txHash: payload.txHash },
      getErrorMessage(err),
    );
  }
};

export const emitReferralVolume = (
  { ref, keyId, partnerFeeBps }: ReferralAttribution,
  chainId: number,
  txHash: string,
  tokens: ERC20Token[],
  amounts: string[],
  variableRate: bigint,
  action: PartnerTransactionType,
): void => {
  if (!ref) return;

  try {
    const referralPayload = {
      txHash,
      ref,
      chainId,
      tokenAddresses: tokens.map((token) => token.erc20TokenAddress),
      amountChanges: tokens.map((token, i) => Number(getAmountInToken(token, BigInt(amounts[i])))),
      variableRate: variableRate.toString(),
      action,
    };

    if (keyId) {
      sendPartnerReferralTx({ ...referralPayload, keyId, ...(partnerFeeBps !== undefined && { partnerFeeBps }) });
      return;
    }

    emitReferralTx(referralPayload).catch((err) => Logger.error('failed to emit referral tx:', referralPayload, err));
  } catch (err) {
    Logger.error('failed to build referral tx payload:', { ref, chainId, txHash }, err);
  }
};
