import { FeeStructure } from '@hinkal/common';

export const parseFeeStructure = (
  feeToken: string | undefined,
  feeAmount: string | undefined,
  variableRate: bigint,
): FeeStructure<bigint> | undefined => {
  if (!feeToken || !feeAmount) return undefined;

  return {
    feeToken,
    flatFee: BigInt(feeAmount),
    variableRate,
  };
};
