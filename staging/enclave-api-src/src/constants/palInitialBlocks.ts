import { chainIds } from '@hinkal/common';

export const PAL_EVENTS_INITIAL_BLOCK_BY_CHAIN: Partial<Record<number, number>> = {
  [chainIds.bnbMainnet]: 112845135,
  [chainIds.ethMainnet]: 25080500,
  [chainIds.polygon]: 86781000,
  [chainIds.arbMainnet]: 462119000,
  [chainIds.tempo]: 32553168,
  [chainIds.arcTestnet]: 54555576,
  [chainIds.optimism]: 151503000,
  [chainIds.base]: 45908000,
  [chainIds.tronNile]: 69670283,
  [chainIds.tronMainnet]: 85062940,
};
