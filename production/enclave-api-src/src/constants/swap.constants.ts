export const MAX_SLIPPAGE_PERCENTAGE = 10;
export const PERCENT_TO_DECIMAL = 0.01;
export const REQUIRED_SWAP_FIELDS_MESSAGE =
  'Missing required fields: organizationId, userId, fromAddress, fromToken, toToken, amount, chainId';
// LIFI calldata goes stale, and a NEAR Intents quote expires 20 min after it is issued (NEAR_BRIDGE_QUOTE_DEADLINE_BUFFER_MS),
// so the quote must be used early enough to leave time for the deposit and the dispatch
export const PRIVATE_SEND_BRIDGE_QUOTE_TTL_MS = 10 * 60 * 1000; // 10 min
