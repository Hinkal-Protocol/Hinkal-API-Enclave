import { liveChainStateService } from '@hinkal/backend-common';
import {
  addressToHexFormat,
  chainIds,
  currentSolanaChainId,
  currentTronChainId,
  getPublicBalancesOfTokens,
  getSolanaPublicBalances,
  isSolanaLike,
  isTronLike,
  isValidSolanaPublicKey,
  isValidTronAddress,
  Logger,
  networkRegistry,
  resetCache,
  TokenBalance,
} from '@hinkal/common';
import { getErc20TokensForChain } from '@hinkal/erc20-registry';
import { hinkalInitializerService } from '../services/hinkalInitializerService';

const validateWalletAddressForChainId = (walletAddress: string, chainId: number): void => {
  if (!networkRegistry[chainId]) {
    throw new Error(`Unsupported chainId: ${chainId}`);
  }

  const isSolanaAddress = isValidSolanaPublicKey(walletAddress);
  const isTronAddress = isValidTronAddress(walletAddress);

  if (isSolanaAddress && !isSolanaLike(chainId)) {
    throw new Error('walletAddress is Solana but chainId is not Solana-like');
  }
  if (isTronAddress && !isTronLike(chainId)) {
    throw new Error('walletAddress is Tron but chainId is not Tron-like');
  }
  if (!isSolanaAddress && !isTronAddress && (isSolanaLike(chainId) || isTronLike(chainId))) {
    throw new Error('walletAddress is EVM-like but chainId is not EVM-like');
  }
};

export const refreshAddressCache = async (address: string, chainId: number) => {
  const hinkal = await hinkalInitializerService.initalizeHinkalForAddress(address, chainId);
  const shieldedPublicKey = hinkal.userKeys.getShieldedPublicKey();

  hinkal.getSupportedChains().forEach((supportedChainId) => {
    resetCache(hinkal, supportedChainId, shieldedPublicKey);
  });
};

export const refreshUserCache = async (
  organizationId: string,
  userId: string,
  signerPublicKey: string,
  walletAddress: string,
) => {
  let addressChainId = chainIds.ethMainnet;
  if (isValidTronAddress(walletAddress)) addressChainId = currentTronChainId;
  else if (isValidSolanaPublicKey(walletAddress)) addressChainId = currentSolanaChainId;

  const hinkal = await hinkalInitializerService.initHinkalForOrganization(
    organizationId,
    userId,
    signerPublicKey,
    walletAddress,
    addressChainId,
  );
  const shieldedPublicKey = hinkal.userKeys.getShieldedPublicKey();

  hinkal.getSupportedChains().forEach((chainId) => {
    resetCache(hinkal, chainId, shieldedPublicKey);
  });
};

export const fetchPrivateBalances = async (
  organizationId: string,
  userId: string,
  signerPublicKey: string,
  walletAddress: string,
  chainId: number | undefined,
  useBlockedUtxos: boolean,
) => {
  let addressChainId = chainIds.ethMainnet;
  if (isValidTronAddress(walletAddress)) addressChainId = currentTronChainId;
  else if (isValidSolanaPublicKey(walletAddress)) addressChainId = currentSolanaChainId;

  const hinkal = await hinkalInitializerService.initHinkalForOrganization(
    organizationId,
    userId,
    signerPublicKey,
    walletAddress,
    addressChainId,
  );

  if (chainId !== undefined) {
    validateWalletAddressForChainId(walletAddress, chainId);
  }

  const targetChainIds = chainId !== undefined ? [chainId] : hinkal.getSupportedChains();
  const privateTokenBalancesByChain = await Promise.all(
    targetChainIds.map(async (targetChainId) => {
      try {
        await liveChainStateService.prepareHinkal(targetChainId, hinkal);
        return await hinkal.getTotalBalance(targetChainId, undefined, undefined, false, true, useBlockedUtxos);
      } catch (err) {
        Logger.error(`Error fetching balances for chainId ${targetChainId}:`, err);
        return [];
      }
    }),
  );
  const privateTokenBalances = privateTokenBalancesByChain.flat();

  return privateTokenBalances
    .filter(({ balance }) => balance > 0n)
    .map(({ token, balance }) => ({ token, balance: balance.toString() }));
};

export const fetchPublicBalances = async (walletAddress: string, chainId: number) => {
  validateWalletAddressForChainId(walletAddress, chainId);

  let balancesByChain: TokenBalance[] = [];
  try {
    if (isSolanaLike(chainId)) {
      balancesByChain = await getSolanaPublicBalances(chainId, walletAddress, getErc20TokensForChain(chainId));
    } else {
      balancesByChain = await getPublicBalancesOfTokens(chainId, addressToHexFormat(walletAddress));
    }
  } catch (err) {
    Logger.error(`Error fetching public balances for chainId ${chainId}:`, err);
  }

  return balancesByChain
    .filter(({ balance }) => balance > 0n)
    .map(({ token, balance }) => ({ token, balance: balance.toString() }));
};
