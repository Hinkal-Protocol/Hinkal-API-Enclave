import { API_ERROR_MESSAGES, HttpError, isValidAddressForChain } from '@hinkal/common';
import { validate as validateUuid } from 'uuid';

export const assertString = (value: unknown, field: string): string => {
  if (typeof value !== 'string' || !value) {
    throw new HttpError(400, `${API_ERROR_MESSAGES.INVALID_REQUEST_PARAMETER}: ${field} must be a non-empty string`);
  }
  return value;
};

export const assertUuid = (value: unknown, field: string): string => {
  if (typeof value !== 'string' || !validateUuid(value))
    throw new HttpError(400, `${API_ERROR_MESSAGES.INVALID_REQUEST_PARAMETER}: ${field} must be a valid UUID`);
  return value;
};

export const invalidAddressMessage = (field: string, chainId: number | string): string =>
  `${API_ERROR_MESSAGES.INVALID_REQUEST_PARAMETER}: ${field} must be a valid address on chain ${chainId}`;

export const assertAddressForChain = (value: unknown, field: string, chainId: number): string => {
  if (!isValidAddressForChain(chainId, value)) throw new HttpError(400, invalidAddressMessage(field, chainId));
  return value;
};
