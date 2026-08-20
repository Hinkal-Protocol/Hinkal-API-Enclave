// sha256(ref) -> variableRate (bips) overrides for /withdraw, so partner refs are not
// readable in the image. Falls back to HINKAL_UNSHIELD_VARIABLE_RATE when ref is missing
// or not present here.
export const WITHDRAW_REF_HASH_VARIABLE_RATE_BPS: Record<string, bigint> = {
  // pm
  bc6fede328ceab4e7d8c8826e225faf2017cd98d97182f1d5340827aeb6895da: 5n,
};
