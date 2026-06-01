import { calculateTotalFee } from '@hinkal/common';
import { SOLANA_MAINNET_USDC_ADDRESS } from './solanaTestConstants';

export const solanaRelayFee = (flatFee: string, variableRate: string, amount: bigint): bigint =>
  calculateTotalFee(amount, {
    feeToken: SOLANA_MAINNET_USDC_ADDRESS,
    flatFee: BigInt(flatFee),
    variableRate: BigInt(variableRate),
  });
