import { API_ERROR_MESSAGES, UserFriendlyErrorCodes } from '@hinkal/common';
import { isAddress } from 'ethers';
import {
  isNativePlaceholderAddress,
  isValidPrivateAddress,
  isValidSolanaPublicKey,
  isValidTronAddress,
  toBase58IfTron,
} from '@hinkal/common/functions/utils/addresses';
import { getRecipientInfoFromUserKeys } from '@hinkal/common/functions/utils/getRecipientInfoFromUserKeys';
import { allocateRecipientInfos } from '@hinkal/common/functions/utils/enclave-recipient-info-storage';
import { UserKeys } from '@hinkal/common/data-structures/crypto-keys/keys';
import { getERC20Token } from '@hinkal/erc20-registry';
import { ERC20Token } from '@hinkal/common/types/token.types';
import { HttpError } from '@hinkal/common/error-handling/customErrors/HttpError';
import { getAmountInToken, getAmountInWei } from '@hinkal/common/functions/web3/etherFunctions';
import { getGasTokenAddress, isGasToken } from '@hinkal/common/functions/utils/gas-token.utils';
import { normalizeTronAddr } from '@hinkal/common/functions/utils/tron.utils';
import { getPublicBalanceByTokenAddress } from '@hinkal/common/functions/utils/publicBalance.utils';
import { getSolanaRootRentExemption } from '@hinkal/common/functions/utils/solanaSendPreflight.utils';
import { processGasEstimates } from '@hinkal/common/functions/pre-transaction/process-gas-estimates';
import { ExternalActionId } from '@hinkal/common/types/external-action.types';
import { Logger } from '@hinkal/common/error-handling/logger';
import { caseInsensitiveEqual } from '@hinkal/common/functions/utils/caseInsensitive.utils';
import { waitForTransactionConfirmation } from '@hinkal/common/functions/utils/tx-confirmation.utils';
import {
  BRIDGE_SUPPORTED_CHAINS,
  CONFIDENTIAL_BRIDGE_CHAINS,
  isConfidentialBridgeChain,
  isSolanaLike,
  isTronLike,
  networkRegistry,
  usesNearIntentsBridge,
} from '@hinkal/common/constants/chains.constants';
import { isNearBridgeSupportedChain } from '@hinkal/common/constants/bridging.constants';
import { userKeysService } from '../services/userKeysService';
import { WalletAddresses } from '../models';
import { MAX_SLIPPAGE_PERCENTAGE } from '../constants/swap.constants';
import { SwapRequestBody, ValidatedNearBridgeRequest, ValidatedSwapRequest } from '../types/swap.types';

export const confirmBroadcastTransaction = async (chainId: number, txHash: string): Promise<void> => {
  try {
    await waitForTransactionConfirmation(chainId, txHash);
  } catch (err) {
    // The reason stays in logs: a friendly reason in the message would win over the pattern that keeps the hash.
    Logger.error(`[confirmBroadcastTransaction] ${txHash} did not succeed:`, err);
    throw new HttpError(502, `${API_ERROR_MESSAGES.TX_BROADCAST_NOT_SUCCEEDED}: ${txHash}`);
  }
};

export const assertEnoughGasForDeposit = async (
  chainId: number,
  walletAddress: string,
  token: ERC20Token,
  amountWei: bigint,
): Promise<void> => {
  const gasToken = getERC20Token(getGasTokenAddress(chainId), chainId);
  if (!gasToken) return;

  const externalActionId = isTronLike(chainId) ? ExternalActionId.Transact : ExternalActionId.ProofLess;
  const { priceOfTransactionInToken: gasCost } = await processGasEstimates(chainId, gasToken, externalActionId, 1);
  if (gasCost === undefined) return;

  let gasTokenBalance: bigint | null;
  let reserve: bigint;
  try {
    [gasTokenBalance, reserve] = await Promise.all([
      getPublicBalanceByTokenAddress(chainId, normalizeTronAddr(walletAddress), gasToken.erc20TokenAddress),
      isSolanaLike(chainId) ? getSolanaRootRentExemption(chainId) : 0n,
    ]);
  } catch (err) {
    Logger.error('assertEnoughGasForDeposit: failed to fetch gas token balance', err);
    return;
  }
  if (gasTokenBalance === null) return;

  const required = gasCost + reserve + (isGasToken(token) ? amountWei : 0n);
  if (gasTokenBalance >= required) return;

  const networkName = networkRegistry[chainId]?.name ?? `chain ${chainId}`;
  throw new HttpError(
    400,
    `${UserFriendlyErrorCodes.INSUFFICIENT_FUNDS_GAS} (${gasToken.symbol} on ${networkName}: need ~${getAmountInToken(gasToken, required)}, have ${getAmountInToken(gasToken, gasTokenBalance)})`,
  );
};

export const parseChainId = (chainId: unknown): number => {
  const parsed = Number(chainId);
  if (!Number.isFinite(parsed)) throw new HttpError(400, API_ERROR_MESSAGES.INVALID_CHAIN_ID);
  return parsed;
};

export const INVALID_AMOUNTS_ERROR = 'Amounts must be positive integers in base units';

// Accepts any input BigInt() parses (routes convert with BigInt), so only zero/negative/unparsable values are rejected.
export const isPositiveAmount = (amount: unknown): boolean => {
  try {
    return BigInt(amount as string) > 0n;
  } catch {
    return false;
  }
};

export const isPositiveAmountList = (amounts: unknown): boolean =>
  Array.isArray(amounts) && amounts.length > 0 && amounts.every(isPositiveAmount);

export const resolveToken = (tokenAddress: unknown, chainId: number): ERC20Token => {
  const token = getERC20Token(String(tokenAddress), chainId);
  if (!token) throw new HttpError(400, API_ERROR_MESSAGES.TOKEN_NOT_FOUND);
  return token;
};

export const resolvePrivateRecipient = async (to: string, chainId: number): Promise<string> => {
  if (isNativePlaceholderAddress(to)) {
    throw new HttpError(400, API_ERROR_MESSAGES.RECIPIENT_IS_NATIVE_PLACEHOLDER);
  }

  const [allocation] = await allocateRecipientInfos([toBase58IfTron(chainId, to)]);

  const existing = allocation?.recipientInfo;
  if (existing && isValidPrivateAddress(existing)) return existing;

  throw new HttpError(400, API_ERROR_MESSAGES.RECIPIENT_INFO_NOT_RESOLVED);
};

export const resolveRecipientInfo = async (recipientInfo: string, chainId: number): Promise<string> => {
  if (isValidPrivateAddress(recipientInfo)) return recipientInfo;

  if (isNativePlaceholderAddress(recipientInfo)) {
    throw new HttpError(400, API_ERROR_MESSAGES.RECIPIENT_INFO_IS_NATIVE_PLACEHOLDER);
  }

  if (!isAddress(recipientInfo) && !isValidSolanaPublicKey(recipientInfo) && !isValidTronAddress(recipientInfo)) {
    throw new HttpError(400, API_ERROR_MESSAGES.INVALID_RECIPIENT_INFO);
  }

  // get private recipientInfo from ethereumAddress/solanaAddress/tronAddress
  const signature = await userKeysService.findOrCreatePrivateKey(toBase58IfTron(chainId, recipientInfo));
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
    throw new HttpError(
      400,
      `${API_ERROR_MESSAGES.INVALID_SLIPPAGE}: must be between 0 and ${MAX_SLIPPAGE_PERCENTAGE}`,
    );
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
    throw new HttpError(400, `${API_ERROR_MESSAGES.BRIDGE_ROUTE_NOT_SUPPORTED}: ${sourceChainId} -> ${destChainId}`);
  }

  const sourceToken = resolveToken(fromToken, sourceChainId);
  const destToken = resolveToken(toToken, destChainId);
  if (destChainId === sourceChainId && caseInsensitiveEqual(sourceToken.erc20TokenAddress, destToken.erc20TokenAddress))
    throw new HttpError(400, API_ERROR_MESSAGES.SAME_TOKEN_SWAP);

  const bridgeAmount = getAmountInWei(sourceToken, String(amount));
  if (bridgeAmount <= 0n) throw new HttpError(400, API_ERROR_MESSAGES.AMOUNT_NOT_POSITIVE);

  const parsedSlippage = parseSlippagePercentage(slippagePercentage);

  const wallet = wallets.find((w) => caseInsensitiveEqual(walletAddressForChain(w, sourceChainId), fromAddress));
  const destinationRecipient = wallet && walletAddressForChain(wallet, destChainId);
  if (!destinationRecipient) {
    throw new HttpError(
      400,
      `${API_ERROR_MESSAGES.NO_ADDRESS_ON_DESTINATION_CHAIN}: wallet ${fromAddress}, chain ${destChainId}`,
    );
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
      `${API_ERROR_MESSAGES.BRIDGE_ROUTE_NOT_SUPPORTED}: ${parsedChainId} -> ${parsedToChainId}, supported: ${BRIDGE_SUPPORTED_CHAINS.join(', ')}`,
    );
  }

  const inToken = resolveToken(fromToken, parsedChainId);
  const outToken = resolveToken(toToken, parsedToChainId);

  if (!isCrossChain && caseInsensitiveEqual(inToken.erc20TokenAddress, outToken.erc20TokenAddress)) {
    throw new HttpError(400, API_ERROR_MESSAGES.SAME_TOKEN_SWAP);
  }

  const amountWei = getAmountInWei(inToken, String(amount));
  if (amountWei <= 0n) throw new HttpError(400, API_ERROR_MESSAGES.AMOUNT_NOT_POSITIVE);

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
    throw new HttpError(400, API_ERROR_MESSAGES.SAME_TOKEN_SWAP);
  }

  if (isCrossChain && (!isConfidentialBridgeChain(parsedChainId) || !isConfidentialBridgeChain(parsedToChainId))) {
    throw new HttpError(
      400,
      `${API_ERROR_MESSAGES.CROSS_CHAIN_SWAP_NOT_SUPPORTED}, supported: ${CONFIDENTIAL_BRIDGE_CHAINS.join(', ')}`,
    );
  }

  if (isCrossChain && !caseInsensitiveEqual(inToken.symbol, outToken.symbol)) {
    throw new HttpError(400, API_ERROR_MESSAGES.CROSS_CHAIN_SWAP_SAME_TOKEN_ONLY);
  }

  const amountWei = getAmountInWei(inToken, String(amount));
  if (amountWei <= 0n) throw new HttpError(400, API_ERROR_MESSAGES.AMOUNT_NOT_POSITIVE);

  const parsedSlippage = parseSlippagePercentage(slippagePercentage);

  return { parsedChainId, isCrossChain, inToken, outToken, amountWei, parsedSlippage };
};
