import { chainIds } from '@hinkal/common';

/** Canonical USDT on Tron Nile (see tronNileRegistry.json). */
export const TRON_NILE_USDT_ADDRESS = '0xECa9bC828A3005B9a3b909f2cc5c2a54794DE05F';

export const TRON_NILE_CHAIN_ID = chainIds.tronNile;

export const USDT_DECIMALS = 6;

/** Same 6 decimals as USDT; used with `toUnits` in WAAS balance helpers. */
export const USDC_DECIMALS = USDT_DECIMALS;
