import { isAddress } from 'ethers';
import { getAnyRecipientInfo } from '@hinkal/common/API/getAnyRecipientInfo';
import {
  isValidPrivateAddress,
  isValidSolanaPublicKey,
  isValidTronAddress,
} from '@hinkal/common/functions/utils/addresses';
import { getRecipientInfoFromUserKeys } from '@hinkal/common/functions/utils/getRecipientInfoFromUserKeys';
import { UserKeys } from '@hinkal/common/data-structures/crypto-keys/keys';
import { getERC20Token } from '@hinkal/erc20-registry';
import { ERC20Token } from '@hinkal/common/types/token.types';
import { HttpError } from '@hinkal/common/error-handling/customErrors/HttpError';
import { getAmountInWei } from '@hinkal/common/functions/web3/etherFunctions';
import { caseInsensitiveEqual } from '@hinkal/common/functions/utils/caseInsensitive.utils';
import {
  BRIDGE_SUPPORTED_CHAINS,
  CONFIDENTIAL_BRIDGE_CHAINS,
  isConfidentialBridgeChain,
  isSolanaLike,
  isTronLike,
  usesNearIntentsBridge,
} from '@hinkal/common/constants/chains.constants';
import { isNearBridgeSupportedChain } from '@hinkal/common/constants/bridging.constants';
import { userKeysService } from '../services/userKeysService';
import { WalletAddresses } from '../models';
import { MAX_SLIPPAGE_PERCENTAGE } from '../constants/swap.constants';
import { SwapRequestBody, ValidatedNearBridgeRequest, ValidatedSwapRequest } from '../types/swap.types';

export const parseChainId = (chainId: unknown): number => {
  const parsed = Number(chainId);
  if (!Number.isFinite(parsed)) throw new HttpError(400, 'Invalid or missing chainId');
  return parsed;
};

export const resolveToken = (tokenAddress: unknown, chainId: number): ERC20Token => {
  const token = getERC20Token(String(tokenAddress), chainId);
  if (!token) throw new HttpError(400, 'Token not found in registry for provided chainId');
  return token;
};

export const resolvePrivateRecipient = async (to: string): Promise<string> => {
  const existing = await getAnyRecipientInfo(to);
  if (existing && isValidPrivateAddress(existing)) return existing;

  throw new HttpError(400, 'Could not resolve private recipient info from provided public address');
};

export const resolveRecipientInfo = async (recipientInfo: string): Promise<string> => {
  if (isValidPrivateAddress(recipientInfo)) return recipientInfo;

  if (!isAddress(recipientInfo) && !isValidSolanaPublicKey(recipientInfo) && !isValidTronAddress(recipientInfo)) {
    throw new HttpError(
      400,
      'recipientInfo must be a valid private recipient info, Ethereum address, Solana address, or Tron address',
    );
  }

  // get private recipientInfo from ethereumAddress/solanaAddress/tronAddress
  const signature = await userKeysService.findOrCreatePrivateKey(recipientInfo);
  const userKeys = new UserKeys(signature);
  return getRecipientInfoFromUserKeys(userKeys);
};

export const walletAddressForChain = (wallet: WalletAddresses, chainId: number): string | undefined => {
  if (isSolanaLike(chainId)) return wallet.solanaAddress;
  if (isTronLike(chainId)) return wallet.tronAddress;
  return wallet.evmAddress;
};

export const hasMissingSwapFields = (body: SwapRequestBody): boolean =>
  !body.organizationId ||
  !body.userId ||
  !body.fromAddress ||
  !body.fromToken ||
  !body.toToken ||
  !body.amount ||
  body.chainId === undefined;

export const parseSlippagePercentage = (slippagePercentage?: number | string | null): number | undefined => {
  if (slippagePercentage === undefined || slippagePercentage === null) return undefined;

  const parsed = Number(slippagePercentage);
  if (!Number.isFinite(parsed) || parsed < 0 || parsed > MAX_SLIPPAGE_PERCENTAGE) {
    throw new HttpError(400, `slippagePercentage must be a number between 0 and ${MAX_SLIPPAGE_PERCENTAGE}`);
  }
  return parsed;
};

export const isNearIntentsBridgeRequest = (sourceChainId: number, destChainId: number): boolean => {
  const touchesNonEvmChain = usesNearIntentsBridge(sourceChainId) || usesNearIntentsBridge(destChainId);
  return touchesNonEvmChain && (destChainId !== sourceChainId || isTronLike(sourceChainId));
};

export const resolveAndValidateNearBridgeRequest = (
  fromToken: string,
  toToken: string,
  amount: number | string,
  sourceChainId: number,
  destChainId: number,
  fromAddress: string,
  wallets: WalletAddresses[],
  slippagePercentage?: number | string | null,
): ValidatedNearBridgeRequest => {
  if (!isNearBridgeSupportedChain(sourceChainId) || !isNearBridgeSupportedChain(destChainId)) {
    throw new HttpError(400, `Bridging from chain ${sourceChainId} to chain ${destChainId} is not supported`);
  }

  const sourceToken = resolveToken(fromToken, sourceChainId);
  const destToken = resolveToken(toToken, destChainId);
  if (destChainId === sourceChainId && caseInsensitiveEqual(sourceToken.erc20TokenAddress, destToken.erc20TokenAddress))
    throw new HttpError(400, 'fromToken and toToken must be different tokens when swapping on the same chain');

  const bridgeAmount = getAmountInWei(sourceToken, String(amount));
  if (bridgeAmount <= 0n) throw new HttpError(400, 'amount must be greater than zero');

  const parsedSlippage = parseSlippagePercentage(slippagePercentage);

  const wallet = wallets.find((w) => caseInsensitiveEqual(walletAddressForChain(w, sourceChainId), fromAddress));
  const destinationRecipient = wallet && walletAddressForChain(wallet, destChainId);
  if (!destinationRecipient) {
    throw new HttpError(400, `Wallet ${fromAddress} has no address on destination chain ${destChainId}`);
  }

  return { sourceToken, destToken, bridgeAmount, parsedSlippage, destinationRecipient };
};

export const resolveAndValidatePublicSwapRequest = (
  fromToken: string,
  toToken: string,
  chainId: number | string,
  amount: number | string,
  slippagePercentage?: number | string | null,
  toChainId?: number | string | null,
): ValidatedSwapRequest => {
  const parsedChainId = parseChainId(chainId);
  const parsedToChainId = toChainId === undefined || toChainId === null ? parsedChainId : parseChainId(toChainId);
  const isCrossChain = parsedChainId !== parsedToChainId;

  if (
    isCrossChain &&
    (!BRIDGE_SUPPORTED_CHAINS.includes(parsedChainId) || !BRIDGE_SUPPORTED_CHAINS.includes(parsedToChainId))
  ) {
    throw new HttpError(
      400,
      `Bridging from chain ${parsedChainId} to chain ${parsedToChainId} is not supported. Supported chains: ${BRIDGE_SUPPORTED_CHAINS.join(', ')}`,
    );
  }

  const inToken = resolveToken(fromToken, parsedChainId);
  const outToken = resolveToken(toToken, parsedToChainId);

  if (!isCrossChain && caseInsensitiveEqual(inToken.erc20TokenAddress, outToken.erc20TokenAddress)) {
    throw new HttpError(400, 'fromToken and toToken must be different tokens when swapping on the same chain');
  }

  const amountWei = getAmountInWei(inToken, String(amount));
  if (amountWei <= 0n) throw new HttpError(400, 'amount must be greater than zero');

  const parsedSlippage = parseSlippagePercentage(slippagePercentage);

  return { parsedChainId, isCrossChain, inToken, outToken, amountWei, parsedSlippage };
};

export const resolveAndValidateSwapRequest = (
  fromToken: string,
  toToken: string,
  chainId: number | string,
  amount: number | string,
  slippagePercentage?: number | string | null,
  toChainId?: number | string | null,
): ValidatedSwapRequest => {
  const parsedChainId = parseChainId(chainId);
  const parsedToChainId = toChainId === undefined || toChainId === null ? parsedChainId : parseChainId(toChainId);
  const isCrossChain = parsedChainId !== parsedToChainId;

  const inToken = resolveToken(fromToken, parsedChainId);
  const outToken = resolveToken(toToken, parsedToChainId);

  if (!isCrossChain && caseInsensitiveEqual(inToken.erc20TokenAddress, outToken.erc20TokenAddress)) {
    throw new HttpError(400, 'fromToken and toToken must be different tokens when swapping on the same chain');
  }

  if (isCrossChain && (!isConfidentialBridgeChain(parsedChainId) || !isConfidentialBridgeChain(parsedToChainId))) {
    throw new HttpError(
      400,
      `Cross-chain private swap is supported between these chains only: ${CONFIDENTIAL_BRIDGE_CHAINS.join(', ')}`,
    );
  }

  if (isCrossChain && !caseInsensitiveEqual(inToken.symbol, outToken.symbol)) {
    throw new HttpError(
      400,
      'Cross-chain private swap supports bridging the same token only (e.g. USDC on Ethereum to USDC on Base)',
    );
  }

  const amountWei = getAmountInWei(inToken, String(amount));
  if (amountWei <= 0n) throw new HttpError(400, 'amount must be greater than zero');

  const parsedSlippage = parseSlippagePercentage(slippagePercentage);

  return { parsedChainId, isCrossChain, inToken, outToken, amountWei, parsedSlippage };
};
