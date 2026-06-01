import { ExternalActionId } from '@hinkal/common';

const VALID_EXTERNAL_ACTION_IDS = new Set<string>([
  ExternalActionId.Transact,
  ExternalActionId.Uniswap,
  ExternalActionId.Odos,
  ExternalActionId.OneInch,
  ExternalActionId.Okx,
]);

export const isValidExternalActionId = (value: string): value is ExternalActionId =>
  VALID_EXTERNAL_ACTION_IDS.has(value);
