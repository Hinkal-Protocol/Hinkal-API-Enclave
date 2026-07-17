import { HttpError } from '@hinkal/common';
import { validate as validateUuid } from 'uuid';

export const assertString = (value: unknown, field: string): string => {
  if (typeof value !== 'string' || !value) throw new HttpError(400, `Invalid ${field}: must be a non-empty string`);
  return value;
};

export const assertUuid = (value: unknown, field: string): string => {
  if (typeof value !== 'string' || !validateUuid(value))
    throw new HttpError(400, `Invalid ${field}: must be a valid UUID`);
  return value;
};
