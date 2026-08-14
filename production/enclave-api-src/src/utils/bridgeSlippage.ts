import { DEFAULT_BRIDGING_SLIPPAGE, ERC20Token, getBridgingSlippagePercent, pricesStorage } from '@hinkal/common';

export const resolveBridgeSlippagePercent = async (
  inToken: ERC20Token,
  amount: string,
  slippagePercentage: number | undefined,
): Promise<number> => {
  if (slippagePercentage !== undefined) return slippagePercentage;
  try {
    const [price] = await pricesStorage.getAndUpdatePrices(inToken.chainId, [inToken.erc20TokenAddress]);
    return getBridgingSlippagePercent(amount, price);
  } catch {
    return DEFAULT_BRIDGING_SLIPPAGE;
  }
};
