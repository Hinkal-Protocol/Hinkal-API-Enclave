// sha256(ref) -> variableRate (bips) overrides for /withdraw, so partner refs are not
// readable in the image. Falls back to HINKAL_UNSHIELD_VARIABLE_RATE when ref is missing
// or not present here.
export const WITHDRAW_REF_HASH_VARIABLE_RATE_BPS: Record<string, bigint> = {
  // parimatch
  beaefa7486f15cc6aaa42d91eaa8a06ed07bc18c1f5e828be7537e513aba6bd1: 5n,
};
