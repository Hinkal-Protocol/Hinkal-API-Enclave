import { emitReferralTx, ERC20Token, getAmountInToken, Logger } from '@hinkal/common';

export const emitReferralVolume = (
  ref: string | undefined,
  chainId: number,
  txHash: string,
  tokens: ERC20Token[],
  amounts: string[],
  variableRate: bigint,
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
    };

    emitReferralTx(referralPayload).catch((err) => Logger.error('failed to emit referral tx:', referralPayload, err));
  } catch (err) {
    Logger.error('failed to build referral tx payload:', { ref, chainId, txHash }, err);
  }
};
