/* eslint-disable no-await-in-loop, no-restricted-syntax */
import { getErrorMessage, ReceiveVaultBlockedFund } from '@hinkal/common';
import { hinkalInitializerService } from './hinkalInitializerService';
import { confirmBroadcastTransaction } from '../utils/transactionHelpers';
import {
  FailedReceiveVaultRecovery,
  ReceiveVaultFund,
  ReceiveVaultFundsRequestParams,
  ReceiveVaultRecoveryResult,
  RecoveredReceiveVaultFund,
} from '../types/recovery.types';

const toReceiveVaultFund = ({ record, token, amount, reason }: ReceiveVaultBlockedFund): ReceiveVaultFund => ({
  chainId: token.chainId,
  vaultAddress: record.vaultAddress,
  tokenAddress: token.erc20TokenAddress,
  tokenSymbol: token.symbol,
  amount: amount.toString(),
  reason,
});

export const getReceiveVaultFunds = ({
  organizationId,
  userId,
  signerPublicKey,
  fromAddress,
  chainId,
}: ReceiveVaultFundsRequestParams): Promise<ReceiveVaultFund[]> =>
  hinkalInitializerService.withHinkalForOrganization(
    organizationId,
    userId,
    signerPublicKey,
    fromAddress,
    chainId,
    async (hinkal) => (await hinkal.getReceiveVaultAccount()).blockedFunds.map(toReceiveVaultFund),
  );

export const recoverReceiveVaultFunds = ({
  organizationId,
  userId,
  signerPublicKey,
  fromAddress,
  chainId,
}: ReceiveVaultFundsRequestParams): Promise<ReceiveVaultRecoveryResult> =>
  hinkalInitializerService.withHinkalForOrganization(
    organizationId,
    userId,
    signerPublicKey,
    fromAddress,
    chainId,
    async (hinkal) => {
      const { blockedFunds } = await hinkal.getReceiveVaultAccount();
      const recovered: RecoveredReceiveVaultFund[] = [];
      const failed: FailedReceiveVaultRecovery[] = [];

      for (const blockedFund of blockedFunds.filter(({ token }) => token.chainId === chainId)) {
        const fund = toReceiveVaultFund(blockedFund);
        try {
          const txHash = await hinkal.recoverReceiveVault(blockedFund.record, fund.tokenAddress, chainId, fromAddress);
          if (typeof txHash !== 'string') throw new Error('Receive vault recovery returned no transaction hash');
          await confirmBroadcastTransaction(chainId, txHash);
          recovered.push({ ...fund, txHash });
        } catch (error) {
          failed.push({ ...fund, error: getErrorMessage(error) });
        }
      }

      return { recovered, failed };
    },
  );
