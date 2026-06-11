import { ERC20Token, getERC20Registry, POPULAR_TOKEN_ADDRESSES_BY_CHAIN } from '@hinkal/common';

export const getPopularTokensForChain = (chainId: number): ERC20Token[] => {
  const addresses = POPULAR_TOKEN_ADDRESSES_BY_CHAIN[chainId];
  if (!addresses) return [];

  const tokenByAddress = new Map(
    getERC20Registry(chainId).map((token) => [token.erc20TokenAddress.toLowerCase(), token]),
  );

  return addresses
    .map((address) => tokenByAddress.get(address.toLowerCase()))
    .filter((token): token is ERC20Token => token !== undefined);
};
