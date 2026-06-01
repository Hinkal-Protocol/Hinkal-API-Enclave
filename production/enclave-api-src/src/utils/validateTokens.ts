import { ERC20Token, getERC20Token } from '@hinkal/common';

export type ValidateTokensResult = { ok: true; tokens: ERC20Token[] } | { ok: false; error: string };

export const validateTokens = (tokenAddresses: string[], chainId: number): ValidateTokensResult => {
  const tokens = tokenAddresses.map((addr) => getERC20Token(addr, chainId));
  const invalidIndex = tokens.findIndex((t) => !t);
  if (invalidIndex !== -1) {
    return { ok: false, error: `Token ${tokenAddresses[invalidIndex]} not found on chain ${chainId}` };
  }
  return { ok: true, tokens: tokens as ERC20Token[] };
};
