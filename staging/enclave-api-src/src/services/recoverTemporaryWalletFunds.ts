/* eslint-disable no-await-in-loop, no-restricted-syntax, no-continue */
import {
  API,
  calculateTotalFee,
  ContractType,
  deriveTempWallet,
  ERC20Token,
  ExternalActionId,
  getContractAddress,
  getErrorMessage,
  getFeeStructure,
  getPublicBalancesOfTokens,
  getRandomProxyAvatarIndex,
  hashEthereumAddress,
  Hinkal,
  isNFTToken,
  Logger,
  TemporaryWalletNonceEntry,
  TemporaryWalletRecoveryDestination,
  zeroAddress,
} from '@hinkal/common';
import { hinkalInitializerService } from './hinkalInitializerService';
import {
  FailedTemporaryWalletRecovery,
  RecoveredTemporaryWalletFund,
  SkippedTemporaryWalletNonce,
  TemporaryWalletRecoveryRequestParams,
  TemporaryWalletRecoveryResult,
} from '../types/recovery.types';

const buildRecoveryCalls = (hinkal: Hinkal<unknown>, chainId: number, ethAddress: string, tokenAddress: string) => {
  const hinkalContract = hinkal.getContractWithFetcher(chainId, ContractType.HinkalContract);
  if (!hinkalContract) throw new Error('Hinkal contract not found');

  if (tokenAddress === zeroAddress)
    return [{ from: ethAddress, to: getContractAddress(hinkalContract), calldata: '0x', value: 1n }];

  const { interface: erc20Interface } = hinkal.getContractWithFetcher(chainId, ContractType.ERC20Contract, zeroAddress);
  if (!erc20Interface) throw new Error('ERC20 interface not found');

  return [
    {
      from: ethAddress,
      to: tokenAddress,
      value: 0n,
      calldata: erc20Interface.encodeFunctionData('transfer', [getContractAddress(hinkalContract), 1n]),
    },
  ];
};

const recoverTemporaryWalletBalance = async (
  hinkal: Hinkal<unknown>,
  chainId: number,
  token: ERC20Token,
  amount: bigint,
  privateKey: string,
  ethAddress: string,
  recoveryDestination: TemporaryWalletRecoveryDestination,
  recipientAddress: string,
): Promise<{ txHash: string; recoveredAmount: bigint }> => {
  const withdrawCalls = buildRecoveryCalls(hinkal, chainId, ethAddress, token.erc20TokenAddress);

  const feeStructure = await getFeeStructure(
    chainId,
    token.erc20TokenAddress,
    [token.erc20TokenAddress],
    ExternalActionId.Emporium,
    withdrawCalls,
  );

  const subAccount = {
    index: null,
    name: 'Temporary Wallet',
    createdAt: new Date().toISOString(),
    isHidden: false,
    isFavorite: false,
    privateKey,
    ethAddress,
    isImported: false,
    iconIndex: getRandomProxyAvatarIndex(),
  };

  const recoveredAmount = amount - calculateTotalFee(amount, feeStructure);
  if (recoveredAmount <= 0n) throw new Error('Insufficient funds to cover recovery fees');

  await hinkal.resetMerkleTreesIfNecessary([chainId]);

  const txHash =
    recoveryDestination === TemporaryWalletRecoveryDestination.Confidential
      ? await hinkal.actionReceive([token], [recoveredAmount], feeStructure.feeToken, feeStructure, subAccount)
      : await hinkal.proxySend(
          [token],
          [recoveredAmount],
          subAccount,
          recipientAddress,
          feeStructure.feeToken,
          feeStructure,
        );

  return { txHash, recoveredAmount };
};

export const recoverTemporaryWalletFunds = async (
  params: TemporaryWalletRecoveryRequestParams,
): Promise<TemporaryWalletRecoveryResult> => {
  const { organizationId, userId, signerPublicKey, fromAddress, chainIds } = params;
  if (chainIds.length === 0) return { recovered: [], failed: [], skipped: [] };

  return hinkalInitializerService.withHinkalForOrganization(
    organizationId,
    userId,
    signerPublicKey,
    fromAddress,
    chainIds[0],
    async (hinkal) => {
      const recovered: RecoveredTemporaryWalletFund[] = [];
      const failed: FailedTemporaryWalletRecovery[] = [];
      const skipped: SkippedTemporaryWalletNonce[] = [];

      for (const chainId of chainIds) {
        const hashedEthereumAddress = hashEthereumAddress(await hinkal.getEthereumAddressByChain(chainId));

        let entries: TemporaryWalletNonceEntry[];
        try {
          const { nonces, nonceEntries } = await API.getTemporaryWalletNonces(chainId, hashedEthereumAddress);
          entries =
            nonceEntries ??
            nonces.map((nonce) => ({ nonce, recoveryDestination: TemporaryWalletRecoveryDestination.Public }));
        } catch (error) {
          Logger.error(`Failed to fetch temporary wallet nonces for chain ${chainId}`, error);
          continue;
        }

        for (const { nonce, recoveryDestination } of entries) {
          const { privateKey, address: ethAddress } = deriveTempWallet(hinkal, chainId, BigInt(nonce));

          const balances = (await getPublicBalancesOfTokens(chainId, ethAddress)).filter(
            ({ token, balance }) => balance > 0n && !isNFTToken(token),
          );
          if (balances.length === 0) {
            skipped.push({ chainId, nonce, tempWalletAddress: ethAddress, reason: 'No balance on temporary wallet' });
            continue;
          }

          for (const { token, balance } of balances) {
            try {
              const { txHash, recoveredAmount } = await recoverTemporaryWalletBalance(
                hinkal,
                chainId,
                token,
                balance,
                privateKey,
                ethAddress,
                recoveryDestination,
                fromAddress,
              );
              recovered.push({
                chainId,
                nonce,
                tempWalletAddress: ethAddress,
                tokenAddress: token.erc20TokenAddress,
                tokenSymbol: token.symbol,
                amount: recoveredAmount.toString(),
                txHash,
                recoveredTo: recoveryDestination,
              });
            } catch (error) {
              failed.push({
                chainId,
                nonce,
                tempWalletAddress: ethAddress,
                tokenAddress: token.erc20TokenAddress,
                error: getErrorMessage(error),
              });
            }
          }
        }
      }

      return { recovered, failed, skipped };
    },
  );
};
