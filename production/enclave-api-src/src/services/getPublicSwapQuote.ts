import { callLifiAPI, LifiRequestData } from '@hinkal/common/API/callLifiAPI';
import { isTronLike } from '@hinkal/common/constants/chains.constants';
import { getLifiChainId } from '@hinkal/common/constants/lifi.constants';
import { toTronBase58IfHex } from '@hinkal/common/functions/utils/tron.utils';
import { getAmountInWei } from '@hinkal/common/functions/web3/etherFunctions';
import { ERC20Token } from '@hinkal/common/types/token.types';
import { resolveBridgeSlippagePercent } from '../utils/bridgeSlippage';

type GetPublicSwapQuoteParams = {
  walletAddress: string;
  inSwapToken: ERC20Token;
  outSwapToken: ERC20Token;
  inSwapAmount: string;
  slippagePercentage?: number;
};

type PublicSwapQuote = {
  to: string;
  data: string;
  value: bigint;
  outAmount: bigint;
  minOutAmount: bigint;
  spender: string;
  tool: string;
};

export const getPublicSwapQuote = async ({
  walletAddress,
  inSwapToken,
  outSwapToken,
  inSwapAmount,
  slippagePercentage,
}: GetPublicSwapQuoteParams): Promise<PublicSwapQuote> => {
  const slippagePercent = await resolveBridgeSlippagePercent(inSwapToken, inSwapAmount, slippagePercentage);

  const fromIsTron = isTronLike(inSwapToken.chainId);
  const toIsTron = isTronLike(outSwapToken.chainId);

  const request: LifiRequestData = {
    fromChain: getLifiChainId(inSwapToken.chainId),
    toChain: getLifiChainId(outSwapToken.chainId),
    fromToken: fromIsTron ? toTronBase58IfHex(inSwapToken.erc20TokenAddress) : inSwapToken.erc20TokenAddress,
    toToken: toIsTron ? toTronBase58IfHex(outSwapToken.erc20TokenAddress) : outSwapToken.erc20TokenAddress,
    fromAddress: fromIsTron ? toTronBase58IfHex(walletAddress) : walletAddress,
    toAddress: toIsTron ? toTronBase58IfHex(walletAddress) : walletAddress,
    fromAmount: getAmountInWei(inSwapToken, inSwapAmount).toString(),
    order: 'FASTEST',
    slippage: slippagePercent * 0.01,
  };

  const { lifiResponse } = await callLifiAPI(request);
  if (!lifiResponse?.transactionRequest?.data) throw new Error('LiFi API fetch error');

  const { approvalAddress } = lifiResponse.estimate;

  return {
    to: lifiResponse.transactionRequest.to,
    data: lifiResponse.transactionRequest.data,
    value: BigInt(lifiResponse.transactionRequest.value || '0'),
    outAmount: BigInt(lifiResponse.estimate.toAmount),
    minOutAmount: BigInt(lifiResponse.estimate.toAmountMin),
    spender: approvalAddress ?? lifiResponse.transactionRequest.to,
    tool: lifiResponse.tool,
  };
};
