import {
  AccountActions,
  BridgeQuote,
  caseInsensitiveEqual,
  convertEmporiumOpToCallInfo,
  createLifiBridgeOps,
  ERC20Token,
  ExternalActionId,
  FeeStructure,
  getEquivalentNativeToken,
  getErc20TokensForChain,
  getFeeStructure,
  Hinkal,
  isSolanaLike,
  isTronLike,
  networkRegistry,
  PAY_SEND_VARIABLE_RATE,
  SWAP_ROUTER_ADDRESSES,
  TemporarySubAccount,
  zeroAddress,
} from '@hinkal/common';
import { parseChainId, resolveToken } from '../../utils/transactionHelpers';

export interface BridgeRouteError {
  status: number;
  message: string;
}

interface ResolvedBridgeTokens {
  error?: BridgeRouteError;
  token?: ERC20Token;
  destToken?: ERC20Token;
  parsedChainId?: number;
  parsedDestChainId?: number;
}

export const resolveBridgeTokens = (
  tokenAddress: string,
  chainId: unknown,
  destinationChainId: unknown,
): ResolvedBridgeTokens => {
  const parsedChainId = parseChainId(chainId);
  const parsedDestChainId = parseChainId(destinationChainId);

  if (parsedChainId === parsedDestChainId) {
    return { error: { status: 400, message: 'destinationChainId must differ from chainId for a bridge' } };
  }

  if (
    isSolanaLike(parsedChainId) ||
    isTronLike(parsedChainId) ||
    isSolanaLike(parsedDestChainId) ||
    isTronLike(parsedDestChainId)
  ) {
    return { error: { status: 400, message: 'Bridge only supported between EVM chains' } };
  }

  const token = resolveToken(tokenAddress, parsedChainId);

  const destTokenList = getErc20TokensForChain(parsedDestChainId);
  const isNativeSource = caseInsensitiveEqual(token.erc20TokenAddress, zeroAddress);
  const destToken = isNativeSource
    ? getEquivalentNativeToken(parsedChainId, parsedDestChainId, destTokenList)
    : destTokenList.find((t) => caseInsensitiveEqual(t.symbol, token.symbol));

  if (!destToken) {
    return {
      error: { status: 400, message: `${token.symbol} has no equivalent token on the destination chain` },
    };
  }

  return { token, destToken, parsedChainId, parsedDestChainId };
};

export const deriveTemporarySubAccount = (
  hinkal: Hinkal<unknown>,
  parsedChainId: number,
  nonce: bigint,
): TemporarySubAccount => {
  const walletPrivateKey = hinkal.userKeys.getSignerPrivateKeyFromNonce(nonce);
  const ethAddress = AccountActions.getSignerAddressFromPrivateKey(parsedChainId, walletPrivateKey);
  return { index: Number(nonce), ethAddress, privateKey: walletPrivateKey };
};

interface BridgeFeeStructureResult {
  error?: BridgeRouteError;
  feeStructure?: FeeStructure;
}

export const buildBridgeFeeStructure = async (
  hinkal: Hinkal<unknown>,
  parsedChainId: number,
  token: ERC20Token,
  bridgeAmount: bigint,
  quote: BridgeQuote,
): Promise<BridgeFeeStructureResult> => {
  const { emporiumAddress } = networkRegistry[parsedChainId].contractData;
  const lifiRouterAddress = SWAP_ROUTER_ADDRESSES[ExternalActionId.Lifi][parsedChainId];
  if (!emporiumAddress || !lifiRouterAddress) {
    return { error: { status: 400, message: 'Bridge is not configured for this chain' } };
  }

  const ops = createLifiBridgeOps(
    hinkal,
    parsedChainId,
    emporiumAddress,
    lifiRouterAddress,
    token.erc20TokenAddress,
    bridgeAmount,
    bridgeAmount,
    quote,
  );
  const calls = ops.map((op) => convertEmporiumOpToCallInfo(op, emporiumAddress, parsedChainId));

  const feeStructure = await getFeeStructure(
    parsedChainId,
    token.erc20TokenAddress,
    [token.erc20TokenAddress],
    ExternalActionId.Emporium,
    calls,
    PAY_SEND_VARIABLE_RATE,
  );

  return { feeStructure };
};
