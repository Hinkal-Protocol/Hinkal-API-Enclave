import {
  ENCLAVE_PRIVATE_SEND_VARIABLE_RATE,
  ENCLAVE_PUBLIC_SEND_VARIABLE_RATE,
  ENCLAVE_UNSHIELD_VARIABLE_RATE,
} from '@hinkal/common/constants/protocol.constants';
import { WaasFeeEstimateAction } from '@hinkal/common/types/enclaveApi.types';
import { WaasSpendFeeAction } from '../types';

export const SPEND_VARIABLE_RATES: Record<WaasSpendFeeAction, bigint> = {
  [WaasFeeEstimateAction.Withdraw]: ENCLAVE_UNSHIELD_VARIABLE_RATE,
  [WaasFeeEstimateAction.PrivateTransfer]: ENCLAVE_PRIVATE_SEND_VARIABLE_RATE,
  [WaasFeeEstimateAction.PrivateSend]: ENCLAVE_PUBLIC_SEND_VARIABLE_RATE,
};
