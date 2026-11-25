import {
  addressEqual,
  getErrorMessage,
  Hinkal,
  HttpError,
  Logger,
  normalizeAddress,
  THROWN_ERROR_MESSAGES,
  toJsonSafe,
  TokenBalance,
} from '@hinkal/common';
import { getERC20Token } from '@hinkal/erc20-registry';
import { trackReceiveVaultRecovery } from '../utils/trackReceiveVaultRecovery';
import {
  ReceiveVaultTxData,
  RecoverStuckBalanceParams,
  RecoverStuckBalanceResult,
  ReferralAttribution,
  StuckBalance,
  StuckBalanceKind,
  StuckBalanceSource,
  StuckSourceAmount,
} from '../types';

export const sumByToken = (balances: TokenBalance[]): Map<string, bigint> => {
  const totals = new Map<string, bigint>();
  balances.forEach(({ token, balance }) =>
    totals.set(token.erc20TokenAddress, (totals.get(token.erc20TokenAddress) ?? 0n) + balance),
  );
  return totals;
};

export const getStuckUtxoBalances = async (hinkal: Hinkal<unknown>, chainId: number): Promise<TokenBalance[]> => {
  const balancesByChain = await hinkal.getTotalBalances([chainId], undefined, undefined, false, true, true);
  const chainBalances = balancesByChain.get(chainId);
  if (!chainBalances)
    throw new Error(`${THROWN_ERROR_MESSAGES.FAILED_TO_FETCH_STUCK_BALANCES_FOR_CHAINID}: ${chainId}`);
  return chainBalances;
};

export const recoverStuckBridgeBalances = async (
  hinkal: Hinkal<unknown>,
  chainId: number,
  tokenAddress: string,
  recipientAddress: string,
) => {
  const balances = (await hinkal.getStuckBridgeBalances([chainId])).filter(({ token }) =>
    addressEqual(chainId, token.erc20TokenAddress, tokenAddress),
  );

  const errors: string[] = [];
  let recoveredAmount = 0n;
  await balances.reduce(async (previous, balance) => {
    await previous;
    try {
      await hinkal.recoverStuckBridgeBalance(balance, recipientAddress);
      recoveredAmount += balance.balance;
    } catch (error) {
      errors.push(getErrorMessage(error));
    }
  }, Promise.resolve());

  return {
    foundCount: balances.length,
    recoveredCount: balances.length - errors.length,
    recoveredAmount,
    errors,
  };
};

export const recoverVault = async (
  hinkal: Hinkal<unknown>,
  attribution: ReferralAttribution,
  chainId: number,
  vaultAddress: string,
  tokenAddress: string,
  recipientAddress: string,
): Promise<ReceiveVaultTxData> => {
  const { entries, blockedFunds } = await hinkal.getReceiveVaultAccount();
  const record = [...entries, ...blockedFunds.map(({ record: entryRecord }) => entryRecord)].find((entryRecord) =>
    addressEqual(chainId, entryRecord.vaultAddress, vaultAddress),
  );
  if (!record)
    throw new Error(`${THROWN_ERROR_MESSAGES.RECEIVE_ADDRESS_DOES_NOT_BELONG_TO_THIS_ACCOUNT}: ${vaultAddress}`);

  const recovery = await hinkal.recoverReceiveVault(record, tokenAddress, chainId, recipientAddress, true);
  if (attribution.ref !== undefined) {
    trackReceiveVaultRecovery(hinkal, attribution, chainId, record, tokenAddress, recipientAddress, blockedFunds);
  }
  return recovery;
};

// Only stuck utxos need a registry token; vault and bridge recover any token, like their own routes.
const recoverStuckUtxo = async ({
  hinkal,
  chainId,
  tokenAddress,
  recipientAddress,
  ref,
}: RecoverStuckBalanceParams): Promise<RecoverStuckBalanceResult> => {
  const token = getERC20Token(tokenAddress, chainId);
  if (!token) throw new HttpError(400, `Token ${tokenAddress} not found on chain ${chainId}`);
  return { txHashes: await hinkal.withdrawStuckUtxos(token, recipientAddress, ref) };
};

const recoverStuckBridge = async ({
  hinkal,
  chainId,
  tokenAddress,
  recipientAddress,
}: RecoverStuckBalanceParams): Promise<RecoverStuckBalanceResult> => {
  const { foundCount, recoveredCount, recoveredAmount, errors } = await recoverStuckBridgeBalances(
    hinkal,
    chainId,
    tokenAddress,
    recipientAddress,
  );
  if (!foundCount) throw new HttpError(400, 'No stuck bridge balance found for this token');
  if (!recoveredCount) throw new HttpError(500, errors[0]);
  return { recoveredCount, recoveredAmount: recoveredAmount.toString(), failedCount: errors.length, errors };
};

const recoverStuckVault = async ({
  hinkal,
  chainId,
  tokenAddress,
  recipientAddress,
  vaultAddress = '',
  attribution,
}: RecoverStuckBalanceParams): Promise<RecoverStuckBalanceResult> => ({
  txData: toJsonSafe(
    await recoverVault(hinkal, attribution, chainId, vaultAddress, tokenAddress, recipientAddress),
  ) as ReceiveVaultTxData,
});

const RECOVERIES = {
  [StuckBalanceKind.Utxo]: recoverStuckUtxo,
  [StuckBalanceKind.Bridge]: recoverStuckBridge,
  [StuckBalanceKind.Vault]: recoverStuckVault,
};

const failOnScanError =
  (kind: StuckBalanceKind) =>
  (error: unknown): never => {
    Logger.error(`[stuck-balances] ${kind} scan failed:`, error);
    throw error;
  };

const toSourceResponse = (source: StuckSourceAmount): StuckBalanceSource =>
  source.kind === StuckBalanceKind.Vault
    ? {
        kind: source.kind,
        amount: source.amount.toString(),
        vaultAddress: source.vaultAddress,
        reason: source.reason,
      }
    : { kind: source.kind, amount: source.amount.toString() };

export const getStuckBalances = async (hinkal: Hinkal<unknown>, chainId: number): Promise<StuckBalance[]> => {
  const [utxoBalances, bridgeBalances, blockedFunds] = await Promise.all([
    getStuckUtxoBalances(hinkal, chainId).catch(failOnScanError(StuckBalanceKind.Utxo)),
    hinkal.getStuckBridgeBalances([chainId]).catch(failOnScanError(StuckBalanceKind.Bridge)),
    hinkal
      .getReceiveVaultAccount()
      .then((account) => account.blockedFunds)
      .catch(failOnScanError(StuckBalanceKind.Vault)),
  ]);

  const sources: StuckSourceAmount[] = [
    ...Array.from(
      sumByToken(utxoBalances),
      ([tokenAddress, amount]): StuckSourceAmount => ({ tokenAddress, kind: StuckBalanceKind.Utxo, amount }),
    ),
    ...Array.from(
      sumByToken(bridgeBalances),
      ([tokenAddress, amount]): StuckSourceAmount => ({ tokenAddress, kind: StuckBalanceKind.Bridge, amount }),
    ),
    ...blockedFunds
      .filter(({ token }) => token.chainId === chainId)
      .map(
        ({ record, token, amount, reason }): StuckSourceAmount => ({
          tokenAddress: token.erc20TokenAddress,
          kind: StuckBalanceKind.Vault,
          amount,
          vaultAddress: record.vaultAddress,
          reason,
        }),
      ),
  ].filter(({ amount }) => amount > 0n);

  const byToken = new Map<string, StuckSourceAmount[]>();
  // Sources read token addresses from different places, so case can differ for the same token.
  sources.forEach((source) => {
    const key = normalizeAddress(chainId, source.tokenAddress);
    byToken.set(key, [...(byToken.get(key) ?? []), source]);
  });

  return Array.from(byToken.values(), (tokenSources) => ({
    chainId,
    tokenAddress: tokenSources[0].tokenAddress,
    balance: tokenSources.reduce((sum, { amount }) => sum + amount, 0n).toString(),
    sources: tokenSources.map(toSourceResponse),
  }));
};

export const recoverStuckBalance = (params: RecoverStuckBalanceParams, kind: StuckBalanceKind) => {
  if (!Object.hasOwn(RECOVERIES, kind)) throw new HttpError(400, `Invalid kind: ${String(kind)}`);
  return RECOVERIES[kind](params);
};
