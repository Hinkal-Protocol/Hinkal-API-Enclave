import {
  buildReceiveVaultRecoverWithFee,
  getErrorMessage,
  getReceiveVaultCanonicalChainId,
  getReceiveVaultRecoverFeeStructure,
  Hinkal,
  isReceiveVaultDeployed,
  Logger,
  ReceiveVaultBlockedFund,
  ReceiveVaultBlockReason,
} from '@hinkal/common';
import { getERC20Token } from '@hinkal/erc20-registry';
import { VAULT_REFUND_LISTEN_MS, VAULT_REFUND_SWEEP_INTERVAL_MS } from '../constants';
import { RecentlyAttemptedVault, RefundCreator, StuckBalanceKind } from '../types';
import { executeReceiveVaultRecoverWithFee, loadRecentlyAttemptedVaults } from '../utils/receiveVaultHenclaveCalls';
import { hinkalInitializerService } from './hinkalInitializerService';
import { loadBinding } from './receiveVaultBinding';
import { getStuckBalances, recoverStuckBalance } from './stuckBalances';

// Refunds an API-key address's stuck funds to its refundTo: notes and bridge bounces through the same recovery
// a wallet owner uses, vault funds through recoverWithFee (the relayer submits it and keeps the fee). Only
// addresses the keeper found funds in within the last hour are checked.
class VaultRefundService {
  private timer: NodeJS.Timeout | null = null;

  private sweeping = false;

  // Stuck note amounts per creator, chain and token, from the previous sweep and this one. A fresh settle's note
  // looks stuck until its payout is scheduled, so a note balance is refunded only once it is unchanged across two
  // sweeps. Per instance: another instance or a restart only delays a refund by one sweep.
  private previousStuck = new Map<string, string>();

  private currentStuck = new Map<string, string>();

  init(): void {
    if (this.timer) return;
    this.sweep();
    this.timer = setInterval(() => {
      this.sweep();
    }, VAULT_REFUND_SWEEP_INTERVAL_MS);
  }

  private async sweep(): Promise<void> {
    if (this.sweeping) return;
    this.sweeping = true;
    this.currentStuck = new Map();
    try {
      const vaults = await loadRecentlyAttemptedVaults(new Date(Date.now() - VAULT_REFUND_LISTEN_MS));
      const creators = await this.groupByCreator(vaults);
      await Array.from(creators).reduce(async (previous, [creatorAddress, creator]) => {
        await previous;
        await this.refundCreator(creatorAddress, creator);
      }, Promise.resolve());
    } catch (err) {
      Logger.error('[VaultRefundService] sweep failed:', getErrorMessage(err));
    } finally {
      this.previousStuck = this.currentStuck;
      this.sweeping = false;
    }
  }

  // Addresses of one partner key and refundTo share a creator account, so each account is refunded once per sweep.
  private async groupByCreator(vaults: RecentlyAttemptedVault[]): Promise<Map<string, RefundCreator>> {
    const creators = new Map<string, RefundCreator>();
    await vaults.reduce(async (previous, { vaultAddress, network, chainIds }) => {
      await previous;
      try {
        const binding = await loadBinding(getReceiveVaultCanonicalChainId(network), vaultAddress);
        if (!binding?.refundTo) return;
        const creator = creators.get(binding.creatorAddress) ?? { refundTo: binding.refundTo, chainIds: new Set() };
        chainIds.forEach((chainId) => creator.chainIds.add(chainId));
        creators.set(binding.creatorAddress, creator);
      } catch (err) {
        Logger.error(`[VaultRefundService] binding load failed for ${vaultAddress}:`, getErrorMessage(err));
      }
    }, Promise.resolve());
    return creators;
  }

  // Never throws. Two instances overlap only during a deploy; a second refund of the same funds just fails.
  private async refundCreator(creatorAddress: string, { refundTo, chainIds }: RefundCreator): Promise<void> {
    try {
      await Array.from(chainIds).reduce(async (previous, chainId) => {
        await previous;
        await hinkalInitializerService.withHinkalForAddress(creatorAddress, chainId, (hinkal) =>
          this.refundChain(hinkal, chainId, creatorAddress, refundTo),
        );
      }, Promise.resolve());
    } catch (err) {
      Logger.error(`[VaultRefundService] refund failed for ${creatorAddress}:`, getErrorMessage(err));
    }
  }

  private async refundChain(hinkal: Hinkal<unknown>, chainId: number, creatorAddress: string, refundTo: string) {
    const balances = await getStuckBalances(hinkal, chainId);
    const sources = balances.flatMap(({ tokenAddress, sources: tokenSources }) =>
      tokenSources.map(({ kind, amount }) => ({ tokenAddress, kind, amount })),
    );
    // One at a time: every recovery spends from the same account.
    await sources.reduce(async (previous, { tokenAddress, kind, amount }) => {
      await previous;
      if (kind === StuckBalanceKind.Vault) return;
      if (kind === StuckBalanceKind.Utxo) {
        const key = `${creatorAddress}:${chainId}:${tokenAddress}`;
        this.currentStuck.set(key, String(amount));
        if (this.previousStuck.get(key) !== String(amount)) return;
      }
      await recoverStuckBalance(
        { hinkal, chainId, tokenAddress, recipientAddress: refundTo, attribution: {} },
        kind,
      ).catch((err) =>
        Logger.error(
          `[VaultRefundService] ${kind} refund of ${tokenAddress} for ${creatorAddress} on ${chainId} failed:`,
          getErrorMessage(err),
        ),
      );
    }, Promise.resolve());

    if (!sources.some(({ kind }) => kind === StuckBalanceKind.Vault)) return;
    const { blockedFunds } = await hinkal.getReceiveVaultAccount();
    await blockedFunds
      // Flagged senders and tokens outside the registry are left for manual handling.
      .filter(
        ({ token, reason }) =>
          token.chainId === chainId &&
          reason !== ReceiveVaultBlockReason.RiskySender &&
          getERC20Token(token.erc20TokenAddress, chainId),
      )
      .reduce(async (previous, fund) => {
        await previous;
        await this.refundFund(hinkal, fund, refundTo);
      }, Promise.resolve());
  }

  private async refundFund(
    hinkal: Hinkal<unknown>,
    { record, token, amount }: ReceiveVaultBlockedFund,
    refundTo: string,
  ) {
    const { chainId, erc20TokenAddress } = token;
    try {
      // Priced in the token itself; a token with no price throws and waits for the next sweep.
      const { flatFee } = await getReceiveVaultRecoverFeeStructure(
        chainId,
        erc20TokenAddress,
        refundTo,
        await isReceiveVaultDeployed(chainId, record.vaultAddress),
      );
      if (amount <= flatFee) return;
      const call = await buildReceiveVaultRecoverWithFee(
        hinkal.userKeys,
        record,
        chainId,
        erc20TokenAddress,
        refundTo,
        flatFee,
      );
      const txHash = await executeReceiveVaultRecoverWithFee(call);
      Logger.log(
        `[VaultRefundService] refunded ${erc20TokenAddress} from ${record.vaultAddress} on ${chainId}: ${txHash}`,
      );
    } catch (err) {
      Logger.error(
        `[VaultRefundService] refund of ${erc20TokenAddress} from ${record.vaultAddress} on ${chainId} failed:`,
        getErrorMessage(err),
      );
    }
  }
}

export const vaultRefundService = new VaultRefundService();
