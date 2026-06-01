import {
  convertIntegrationProviderToExternalActionId,
  ERC20Token,
  ExternalActionId,
  getOdosPrice,
  getOKXPrice,
  getOneInchPrice,
  getUniswapPrice,
  IHinkal,
  IntegrationProvider,
  isSolanaLike,
} from '@hinkal/common';

const DEFAULT_SLIPPAGE_PERCENTAGE = 0.7;

type SwapQuoteCandidate = {
  integrationProvider: IntegrationProvider;
  outSwapAmount: bigint;
  swapData: string;
};

type GetBestSwapQuoteParams = {
  hinkal: IHinkal;
  chainId: number;
  inSwapToken: ERC20Token;
  outSwapToken: ERC20Token;
  inSwapAmount: string;
  slippagePercentage?: number;
};

export type BestSwapQuote = {
  swapData: string;
  externalActionId: ExternalActionId;
  outSwapAmount: bigint;
};

const fetchUniswapQuote = async (
  hinkal: IHinkal,
  chainId: number,
  inSwapAmount: string,
  inSwapToken: ERC20Token,
  outSwapToken: ERC20Token,
): Promise<SwapQuoteCandidate> => {
  const priceDict = await getUniswapPrice(hinkal, chainId, inSwapAmount, inSwapToken, outSwapToken);
  if (!priceDict || priceDict.tokenPrice === 0n) {
    throw new Error('No Uniswap price');
  }
  return {
    integrationProvider: IntegrationProvider.UNISWAP,
    outSwapAmount: priceDict.tokenPrice,
    swapData: priceDict.poolFee,
  };
};

const fetchOdosQuote = async (
  chainId: number,
  inSwapToken: ERC20Token,
  outSwapToken: ERC20Token,
  inSwapAmount: string,
  slippagePercentage: number,
): Promise<SwapQuoteCandidate> => {
  const priceDict = await getOdosPrice(chainId, inSwapToken, outSwapToken, inSwapAmount, slippagePercentage);
  if (priceDict.outSwapAmountValue === 0n) {
    throw new Error('No Odos price');
  }
  return {
    integrationProvider: IntegrationProvider.ODOS,
    outSwapAmount: priceDict.outSwapAmountValue,
    swapData: priceDict.odosDataValue,
  };
};

const fetchOneInchQuote = async (
  chainId: number,
  inSwapToken: ERC20Token,
  outSwapToken: ERC20Token,
  inSwapAmount: string,
  slippagePercentage: number,
): Promise<SwapQuoteCandidate> => {
  const priceDict = await getOneInchPrice(chainId, inSwapToken, outSwapToken, inSwapAmount, slippagePercentage);
  if (priceDict.outSwapAmountValue === 0n) {
    throw new Error('No 1inch price');
  }
  return {
    integrationProvider: IntegrationProvider.ONEINCH,
    outSwapAmount: priceDict.outSwapAmountValue,
    swapData: priceDict.oneInchDataValue,
  };
};

const fetchOkxQuote = async (
  chainId: number,
  inSwapToken: ERC20Token,
  outSwapToken: ERC20Token,
  inSwapAmount: string,
  slippagePercentage: number,
): Promise<SwapQuoteCandidate> => {
  const priceDict = await getOKXPrice(chainId, inSwapToken, outSwapToken, inSwapAmount, slippagePercentage);
  if (priceDict.outSwapAmountValue === 0n) {
    throw new Error('No OKX price');
  }
  return {
    integrationProvider: IntegrationProvider.OKX,
    outSwapAmount: priceDict.outSwapAmountValue,
    swapData: priceDict.okxDataValue,
  };
};

const pickBestQuote = (quotes: SwapQuoteCandidate[]): SwapQuoteCandidate => {
  return quotes.reduce((best, current) => (current.outSwapAmount > best.outSwapAmount ? current : best));
};

export const getBestSwapQuote = async ({
  hinkal,
  chainId,
  inSwapToken,
  outSwapToken,
  inSwapAmount,
  slippagePercentage = DEFAULT_SLIPPAGE_PERCENTAGE,
}: GetBestSwapQuoteParams): Promise<BestSwapQuote> => {
  const quotePromises: Promise<SwapQuoteCandidate>[] = isSolanaLike(chainId)
    ? [fetchOkxQuote(chainId, inSwapToken, outSwapToken, inSwapAmount, slippagePercentage)]
    : [
        fetchUniswapQuote(hinkal, chainId, inSwapAmount, inSwapToken, outSwapToken),
        fetchOdosQuote(chainId, inSwapToken, outSwapToken, inSwapAmount, slippagePercentage),
        fetchOneInchQuote(chainId, inSwapToken, outSwapToken, inSwapAmount, slippagePercentage),
      ];

  const settledQuotes = await Promise.allSettled(quotePromises);
  const successfulQuotes = settledQuotes
    .filter((result): result is PromiseFulfilledResult<SwapQuoteCandidate> => result.status === 'fulfilled')
    .map((result) => result.value);

  if (successfulQuotes.length === 0) {
    throw new Error('No swap quotes available');
  }

  const bestQuote = pickBestQuote(successfulQuotes);
  const externalActionId = convertIntegrationProviderToExternalActionId(bestQuote.integrationProvider);

  if (!externalActionId) {
    throw new Error(`Unsupported integration provider: ${bestQuote.integrationProvider}`);
  }

  return {
    swapData: bestQuote.swapData,
    externalActionId,
    outSwapAmount: bestQuote.outSwapAmount,
  };
};
