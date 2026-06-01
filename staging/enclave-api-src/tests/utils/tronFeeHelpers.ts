import { calculateTotalFee, evmHexToTronBase58Address, networkRegistry } from '@hinkal/common';
import { TRON_NILE_USDT_ADDRESS } from './tronTestConstants';

export const tronRelayFee = (flatFee: string, variableRate: string, amount: bigint): bigint =>
  calculateTotalFee(amount, {
    feeToken: TRON_NILE_USDT_ADDRESS,
    flatFee: BigInt(flatFee),
    variableRate: BigInt(variableRate),
  });

export const getDepositOnChainUtxosApprovalSpender = (chainId: number): string => {
  const spender = networkRegistry[chainId].contractData.depositOnChainUtxosExternalActionAddress;
  if (!spender) throw new Error('depositOnChainUtxosExternalActionAddress not configured');
  return evmHexToTronBase58Address(spender);
};
