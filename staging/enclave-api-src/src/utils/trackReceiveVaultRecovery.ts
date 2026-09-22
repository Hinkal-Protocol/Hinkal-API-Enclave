import { addressEqual, Hinkal, Logger, ReceiveVaultBlockedFund, ReceiveVaultRecord } from '@hinkal/common';
import { getCurrentBlockMarker } from './getCurrentBlockMarker';
import { createPendingReceiveVaultRecovery } from './pendingReceiveVaultRecovery';

// Best-effort tracking for the deposit-confirmation listener; errors are only logged, so
// the caller doesn't await this - it runs in the background instead of blocking the
// recovery response on it.
export const trackReceiveVaultRecovery = async (
  hinkal: Hinkal<unknown>,
  ref: string,
  chainId: number,
  record: ReceiveVaultRecord,
  tokenAddress: string,
  recipientAddress: string,
  blockedFunds: ReceiveVaultBlockedFund[],
): Promise<void> => {
  try {
    const expectedAmount =
      blockedFunds.find(
        ({ record: entryRecord, token }) =>
          token.chainId === chainId &&
          addressEqual(chainId, entryRecord.vaultAddress, record.vaultAddress) &&
          addressEqual(chainId, token.erc20TokenAddress, tokenAddress),
      )?.amount ?? 0n;

    const createdAtBlock = await getCurrentBlockMarker(chainId, hinkal);
    await createPendingReceiveVaultRecovery(
      chainId,
      record.vaultAddress,
      tokenAddress,
      recipientAddress,
      expectedAmount,
      createdAtBlock,
      ref,
    );
  } catch (error) {
    Logger.error(
      `[/receive-vault-recover] create pending receive vault recovery failed for ${chainId}-${record.vaultAddress}-${tokenAddress}-${recipientAddress}-${ref}:`,
      error,
    );
  }
};
