import { calculateVariableFee, isSolanaLike } from '@hinkal/common';

export const adjustSwapOutputForPartnerFee = (amounts: bigint[], chainId: number, partnerFeeBps: bigint) => {
  if (isSolanaLike(chainId) || partnerFeeBps === 0n) return amounts;
  return amounts.map((amount, index) => (index === 1 ? amount - calculateVariableFee(amount, partnerFeeBps) : amount));
};
