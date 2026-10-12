import { ERC20Token } from '@hinkal/common';
import { WaasFeeEstimateAction } from '@hinkal/common/types/enclaveApi.types';

export type WaasFeeEstimate = {
  fee: bigint;
  feeToken: ERC20Token;
  nativeFee: bigint;
};

export type WaasSpendFeeAction = Exclude<WaasFeeEstimateAction, WaasFeeEstimateAction.PrivateSwap>;
