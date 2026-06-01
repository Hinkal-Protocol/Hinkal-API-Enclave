import { caseInsensitiveEqual } from '@hinkal/common';
import { addressToHexFormat } from '@hinkal/common/functions/utils/tron.utils';
import { TypedDataDomain, TypedDataField, verifyTypedData } from 'ethers';

export const verifyTronTypedDataSignature = (
  signature: string,
  tronAddress: string,
  domain: TypedDataDomain,
  types: Record<string, TypedDataField[]>,
  value: Record<string, unknown>,
): boolean => {
  try {
    const recovered = verifyTypedData(domain, types, value, signature);
    const expectedHex = addressToHexFormat(tronAddress);
    return caseInsensitiveEqual(recovered, expectedHex);
  } catch {
    return false;
  }
};
