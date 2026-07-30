import { chainIds } from '@hinkal/common';

export const PAL_EVENTS_INITIAL_BLOCK_BY_CHAIN: Partial<Record<number, number>> = {
  [chainIds.bnbMainnet]: 112845135,
  [chainIds.ethMainnet]: 25080500,
  [chainIds.polygon]: 86781000,
  [chainIds.arbMainnet]: 462119000,
  [chainIds.optimism]: 151503000,
  [chainIds.base]: 45908000,
  [chainIds.arcTestnet]: 41865000,
  [chainIds.tronNile]: 67373000,
  [chainIds.tronMainnet]: 82640000,
};
