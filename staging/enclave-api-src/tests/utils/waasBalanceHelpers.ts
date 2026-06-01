import { caseInsensitiveEqual, ERC20Token } from '@hinkal/common';

export const USDC_DECIMALS = 6;

export type BalanceRow = { token: ERC20Token; balance: string };

export const toUnits = (amount: string, decimals: number): bigint => {
  const [whole, fractionRaw = ''] = amount.split('.');
  const fraction = fractionRaw.padEnd(decimals, '0').slice(0, decimals);
  return BigInt(`${whole}${fraction}`);
};

export const getBalanceForToken = (rows: BalanceRow[], tokenAddress: string): bigint => {
  const row = rows.find((entry) => caseInsensitiveEqual(entry.token.erc20TokenAddress, tokenAddress));
  return row ? BigInt(row.balance) : 0n;
};
