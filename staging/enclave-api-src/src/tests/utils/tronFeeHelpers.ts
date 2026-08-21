import { calculateTotalFee } from '@hinkal/common';
import { TRON_NILE_USDT_ADDRESS } from './tronTestConstants';

export const tronRelayFee = (fee: string, variableRate: string, amount: bigint): bigint =>
  calculateTotalFee(amount, {
    feeToken: TRON_NILE_USDT_ADDRESS,
    flatFee: BigInt(fee),
    variableRate: BigInt(variableRate),
  });
