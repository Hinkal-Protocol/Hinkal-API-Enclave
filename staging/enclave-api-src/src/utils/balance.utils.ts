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
  TokenBalance,
  validateWalletAddressForChainId,
} from '@hinkal/common';
import { getErc20TokensForChain } from '@hinkal/erc20-registry';
import { hinkalInitializerService } from '../services/hinkalInitializerService';

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

      const privateTokenBalancesByChain = await hinkal.getTotalBalances(
        targetChainIds,
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
    true,
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
