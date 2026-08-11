import {
  convertIntegrationProviderToExternalActionId,
  DEFAULT_BRIDGING_SLIPPAGE,
  ERC20Token,
  ExternalActionId,
  getExternalSwapAddress,
  getLifiPrice,
  getOKXPrice,
  IntegrationProvider,
  isSolanaLike,
} from '@hinkal/common';
import { PERCENT_TO_DECIMAL } from '../constants/swap.constants';

type SwapQuoteCandidate = {
  integrationProvider: IntegrationProvider;
  outSwapAmount: bigint;
  swapData: string;
};

type GetBestSwapQuoteParams = {
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

const fetchLifiQuote = async (
  chainId: number,
  inSwapToken: ERC20Token,
  outSwapToken: ERC20Token,
  inSwapAmount: string,
  slippagePercentage: number,
): Promise<SwapQuoteCandidate> => {
  const fromAddress = getExternalSwapAddress(chainId, ExternalActionId.Lifi);
  const priceDict = await getLifiPrice(
    inSwapToken,
    outSwapToken,
    inSwapAmount,
    slippagePercentage * PERCENT_TO_DECIMAL,
    fromAddress,
  );
  if (priceDict.outSwapAmountValue === 0n) {
    throw new Error('No LI.FI price');
  }
  return {
    integrationProvider: IntegrationProvider.LIFI,
    outSwapAmount: priceDict.outSwapAmountValue,
    swapData: priceDict.lifiDataValue,
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

export const getBestSwapQuote = async ({
  chainId,
  inSwapToken,
  outSwapToken,
  inSwapAmount,
  slippagePercentage = DEFAULT_BRIDGING_SLIPPAGE,
}: GetBestSwapQuoteParams): Promise<BestSwapQuote> => {
  const quote = isSolanaLike(chainId)
    ? await fetchOkxQuote(chainId, inSwapToken, outSwapToken, inSwapAmount, slippagePercentage)
    : await fetchLifiQuote(chainId, inSwapToken, outSwapToken, inSwapAmount, slippagePercentage);

  const externalActionId = convertIntegrationProviderToExternalActionId(quote.integrationProvider);

  if (!externalActionId) {
    throw new Error(`Unsupported integration provider: ${quote.integrationProvider}`);
  }

  return {
    swapData: quote.swapData,
    externalActionId,
    outSwapAmount: quote.outSwapAmount,
  };
};
