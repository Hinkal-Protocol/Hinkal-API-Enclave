import { liveChainStateService } from '@hinkal/backend-common';
import {
  addressToHexFormat,
  chainIds,
  currentSolanaChainId,
  currentTronChainId,
  getPublicBalancesOfTokens,
  getSolanaPublicBalances,
  isSolanaLike,
  isValidSolanaPublicKey,
  isValidTronAddress,
  Logger,
  resetCache,
  TokenBalance,
  validateWalletAddressForChainId,
} from '@hinkal/common';
import { getErc20TokensForChain } from '@hinkal/erc20-registry';
import { hinkalInitializerService } from '../services/hinkalInitializerService';

export const refreshAddressCache = async (address: string, chainId: number) => {
  await hinkalInitializerService.withHinkalForAddress(address, chainId, async (hinkal) => {
    const shieldedPublicKey = hinkal.userKeys.getShieldedPublicKey();

    hinkal.getSupportedChains().forEach((supportedChainId) => {
      resetCache(hinkal, supportedChainId, shieldedPublicKey);
    });
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

  await hinkalInitializerService.withHinkalForOrganization(
    organizationId,
    userId,
    signerPublicKey,
    walletAddress,
    addressChainId,
    async (hinkal) => {
      const shieldedPublicKey = hinkal.userKeys.getShieldedPublicKey();
      hinkal.getSupportedChains().forEach((chainId) => {
        resetCache(hinkal, chainId, shieldedPublicKey);
      });
    },
  );
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

  if (chainId !== undefined) {
    validateWalletAddressForChainId(walletAddress, chainId);
  }

  return hinkalInitializerService.withHinkalForOrganization(
    organizationId,
    userId,
    signerPublicKey,
    walletAddress,
    addressChainId,
    async (hinkal) => {
      const targetChainIds = chainId !== undefined ? [chainId] : hinkal.getSupportedChains();
      const preparedChainIds: number[] = [];
      await Promise.all(
        targetChainIds.map(async (targetChainId) => {
          try {
            await liveChainStateService.prepareHinkal(targetChainId, hinkal);
            preparedChainIds.push(targetChainId);
          } catch (err) {
            Logger.error(`Error preparing chainId ${targetChainId}:`, err);
          }
        }),
      );

      const privateTokenBalancesByChain = await hinkal.getTotalBalances(
        preparedChainIds,
        undefined,
        undefined,
        false,
        true,
        useBlockedUtxos,
      );
      const privateTokenBalances = [...privateTokenBalancesByChain.values()].flat();

      return privateTokenBalances
        .filter(({ balance }) => balance > 0n)
        .map(({ token, balance }) => ({ token, balance: balance.toString() }));
    },
  );
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
