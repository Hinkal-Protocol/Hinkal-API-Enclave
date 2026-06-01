import { FeeStructure } from '@hinkal/common';

export const parseFeeStructure = (feeStructure?: FeeStructure<string>): FeeStructure<bigint> | undefined => {
  if (!feeStructure) return undefined;

  return {
    feeToken: feeStructure.feeToken,
    flatFee: BigInt(feeStructure.flatFee),
    variableRate: BigInt(feeStructure.variableRate),
  };
};
