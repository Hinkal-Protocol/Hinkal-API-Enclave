import {
  addressEqual,
  getErrorMessage,
  getReceiveVaultCanonicalChainId,
  Hinkal,
  hinkalReceiveVaultRecover,
  HttpError,
  isValidAddressForChain,
  Logger,
  normalizeAddress,
  ReceiveVaultBlockedFund,
  receiveVaultChainsForNetwork,
  ReceiveVaultNetwork,
  THROWN_ERROR_MESSAGES,
  toJsonSafe,
  TokenBalance,
} from '@hinkal/common';
import { getERC20Token } from '@hinkal/erc20-registry';
import { trackReceiveVaultRecovery } from '../utils/trackReceiveVaultRecovery';
import { hinkalInitializerService } from './hinkalInitializerService';
import { partnerCreatorAddress } from './receiveVaultBinding';
import {
  ChainStuckBalances,
  ChainStuckSums,
  ChainSummedStuckBalances,
  ReceiveVaultTxData,
  RecoverStuckBalanceParams,
  RecoverStuckBalanceResult,
  ReferralAttribution,
  RefundToRecoverResult,
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

const loadBlockedFunds = (hinkal: Hinkal<unknown>): Promise<ReceiveVaultBlockedFund[]> =>
  hinkal
    .getReceiveVaultAccount()
    .then((account) => account.blockedFunds)
    .catch(failOnScanError(StuckBalanceKind.Vault));

// blockedFunds may be passed in: the vault scan covers every chain of the network, so one scan serves them all.
export const getStuckBalances = async (
  hinkal: Hinkal<unknown>,
  chainId: number,
  blockedFunds?: ReceiveVaultBlockedFund[],
): Promise<StuckBalance[]> => {
  const [utxoBalances, bridgeBalances, vaultFunds] = await Promise.all([
    getStuckUtxoBalances(hinkal, chainId).catch(failOnScanError(StuckBalanceKind.Utxo)),
    hinkal.getStuckBridgeBalances([chainId]).catch(failOnScanError(StuckBalanceKind.Bridge)),
    blockedFunds ?? loadBlockedFunds(hinkal),
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
    ...vaultFunds
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

// Adds up each chain's sources per token and kind: the partner only needs what is stuck for its refundTo.
const sumChainBalances = (scans: ChainStuckBalances[]): ChainSummedStuckBalances[] => {
  const byChain = new Map<number, ChainStuckSums>();
  scans.forEach(({ chainId, balances, error }) => {
    const chain: ChainStuckSums = byChain.get(chainId) ?? { tokens: new Map() };
    if (error) chain.error = error;
    balances.forEach(({ tokenAddress, sources }) => {
      const key = normalizeAddress(chainId, tokenAddress);
      const token = chain.tokens.get(key) ?? { tokenAddress, kinds: new Map<StuckBalanceKind, bigint>() };
      sources.forEach(({ kind, amount }) => token.kinds.set(kind, (token.kinds.get(kind) ?? 0n) + BigInt(amount)));
      chain.tokens.set(key, token);
    });
    byChain.set(chainId, chain);
  });

  return Array.from(byChain, ([chainId, { error, tokens }]) => ({
    chainId,
    balances: Array.from(tokens.values(), ({ tokenAddress, kinds }) => ({
      tokenAddress,
      balance: Array.from(kinds.values())
        .reduce((sum, amount) => sum + amount, 0n)
        .toString(),
      sources: Array.from(kinds, ([kind, amount]) => ({ kind, amount: amount.toString() })),
    })),
    ...(error && { error }),
  })).filter(({ balances, error }) => balances.length || error);
};

// One creator account's stuck funds on every chain of its network. The vault scan already covers every chain,
// so it runs once and is shared instead of once per chain.
const scanCreator = async (creatorAddress: string, network: ReceiveVaultNetwork): Promise<ChainStuckBalances[]> => {
  const chainIds = receiveVaultChainsForNetwork(network);
  const account = await hinkalInitializerService
    .withHinkalForAddress(creatorAddress, getReceiveVaultCanonicalChainId(network), (hinkal) =>
      hinkal.getReceiveVaultAccount(),
    )
    .catch((err) => {
      Logger.error(`[refund-to] vault scan of ${creatorAddress} failed:`, getErrorMessage(err));
      return getErrorMessage(err);
    });
  // No address was ever created for this refundTo on this network.
  if (typeof account !== 'string' && !account.entries.length) return [];
  const blockedFunds = typeof account === 'string' ? account : account.blockedFunds;
  return Promise.all(
    chainIds.map(async (chainId): Promise<ChainStuckBalances> => {
      try {
        if (typeof blockedFunds === 'string') throw new Error(blockedFunds);
        const balances = await hinkalInitializerService.withHinkalForAddress(creatorAddress, chainId, (hinkal) =>
          getStuckBalances(hinkal, chainId, blockedFunds),
        );
        return { chainId, balances };
      } catch (err) {
        Logger.error(`[refund-to] stuck scan of ${creatorAddress} on ${chainId} failed:`, getErrorMessage(err));
        return { chainId, balances: [], error: getErrorMessage(err) };
      }
    }),
  );
};

// The address format picks the network(s): an EVM refundTo only matches EVM addresses.
export const getRefundToNetworks = (refundTo: string): ReceiveVaultNetwork[] =>
  Object.values(ReceiveVaultNetwork).filter((network) =>
    isValidAddressForChain(getReceiveVaultCanonicalChainId(network), refundTo),
  );

// Stuck funds on every chain of the partner's transfer addresses that refund to refundTo: one creator account per network.
export const getRefundToStuckBalances = async (
  refundTo: string,
  keyId: string,
): Promise<ChainSummedStuckBalances[]> => {
  const scans = await Promise.all(
    getRefundToNetworks(refundTo).map((network) =>
      scanCreator(partnerCreatorAddress(network, keyId, refundTo), network),
    ),
  );
  return sumChainBalances(scans.flat());
};

// Only the requested kind is scanned, so another kind's scan failing cannot block it. Vault funds need one tx per
// vault; notes and bridge bounces recover in one call per token.
const recoverCreatorToRefundTo = async (
  hinkal: Hinkal<unknown>,
  chainId: number,
  tokenAddress: string,
  kind: StuckBalanceKind,
  refundTo: string,
): Promise<RefundToRecoverResult[]> => {
  if (kind === StuckBalanceKind.Vault) {
    const { blockedFunds } = await hinkal.getReceiveVaultAccount();
    return blockedFunds
      .filter(({ token }) => token.chainId === chainId && addressEqual(chainId, token.erc20TokenAddress, tokenAddress))
      .reduce<Promise<RefundToRecoverResult[]>>(async (previous, { record }) => {
        const results = await previous;
        // refundTo sends the tx, not the creator: on Solana and Tron the sender is part of it.
        const result = await hinkalReceiveVaultRecover(hinkal, record, tokenAddress, chainId, refundTo, true, refundTo)
          .then((txData): RefundToRecoverResult => ({ txData: toJsonSafe(txData) as ReceiveVaultTxData }))
          .catch((error): RefundToRecoverResult => ({ error: getErrorMessage(error) }));
        return [...results, result];
      }, Promise.resolve([]));
  }

  const balances =
    kind === StuckBalanceKind.Utxo
      ? await getStuckUtxoBalances(hinkal, chainId)
      : await hinkal.getStuckBridgeBalances([chainId]);
  if (
    !balances.some(({ token, balance }) => balance > 0n && addressEqual(chainId, token.erc20TokenAddress, tokenAddress))
  )
    return [];
  return [
    await recoverStuckBalance(
      { hinkal, chainId, tokenAddress, recipientAddress: refundTo, attribution: {} },
      kind,
    ).catch((error): RefundToRecoverResult => ({ error: getErrorMessage(error) })),
  ];
};

// One token and kind on one chain, from every one of the partner's addresses that refund to refundTo. Notes and
// bridge bounces are sent by us; vault funds come back as txData for the refundTo wallet to send.
export const recoverRefundToStuckBalance = async (
  refundTo: string,
  keyId: string,
  chainId: number,
  tokenAddress: string,
  kind: StuckBalanceKind,
): Promise<RefundToRecoverResult[]> => {
  const network = getRefundToNetworks(refundTo).find((entry) => receiveVaultChainsForNetwork(entry).includes(chainId));
  if (!network) throw new HttpError(400, `refundTo has no transfer addresses on chain ${chainId}`);

  return hinkalInitializerService
    .withHinkalForAddress(partnerCreatorAddress(network, keyId, refundTo), chainId, (hinkal) =>
      recoverCreatorToRefundTo(hinkal, chainId, tokenAddress, kind, refundTo),
    )
    .catch((error): RefundToRecoverResult[] => [{ error: getErrorMessage(error) }]);
};
