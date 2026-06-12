import { randomUUID } from 'crypto';
import { TronWeb } from 'tronweb';
import { ENCLAVE_API_URL, httpClient } from '@hinkal/common';
import { buildEnclaveSignMessage, EnclaveSessionAccess } from '../../constants';
import { CreateSessionResponse } from '../../types/route.types';
import {
  buildDepositAndWithdrawTypedData,
  buildDepositForOtherTypedData,
  buildDepositTypedData,
  buildProoflessDepositTypedData,
  buildSwapTypedData,
  buildTransferTypedData,
  buildWithdrawStuckUtxosTypedData,
  buildWithdrawTypedData,
} from '../../utils/enclaveTypedData';
import { EnclaveTypedDataPayload } from '../../types';
import { EnclaveAuthFields } from './enclaveAuthHelper';

export const buildEnclaveAuthFieldsTron = (
  tronWeb: TronWeb,
  options?: { writeAccess?: boolean },
): EnclaveAuthFields => {
  const nonce = randomUUID();
  const access = options?.writeAccess ? EnclaveSessionAccess.Write : EnclaveSessionAccess.Read;
  const signature = tronWeb.trx.signMessageV2(buildEnclaveSignMessage(nonce, access));

  return {
    signature,
    nonce,
    ...(options?.writeAccess ? { writeAccess: true } : {}),
  };
};

export const createEnclaveSessionTron = async (
  tronWeb: TronWeb,
  tronAddress: string,
  chainId: number,
  options?: { writeAccess?: boolean },
): Promise<EnclaveAuthFields> => {
  const authFields = buildEnclaveAuthFieldsTron(tronWeb, options);
  const response = await httpClient.post<CreateSessionResponse>(`${ENCLAVE_API_URL}/create-session`, {
    ...authFields,
    address: tronAddress,
    chainId,
  });

  if (response.success === false) {
    throw new Error(response.error);
  }

  return authFields;
};

const signEnclaveTypedDataTron = (
  tronWeb: TronWeb,
  tronAddress: string,
  buildTypedData: (nonce: string, address: string) => EnclaveTypedDataPayload,
): EnclaveAuthFields => {
  const nonce = randomUUID();
  const { domain, types, value } = buildTypedData(nonce, tronAddress);
  const signature = tronWeb.trx.signTypedData(domain, types, value);

  return { signature, nonce };
};

export const buildDepositAuthFieldsTron = (
  tronWeb: TronWeb,
  tronAddress: string,
  params: { chainId: number; tokenAddresses: string[]; amounts: string[] },
) =>
  signEnclaveTypedDataTron(tronWeb, tronAddress, (nonce, address) =>
    buildDepositTypedData({ nonce, address, ...params }),
  );

export const buildProoflessDepositAuthFieldsTron = (
  tronWeb: TronWeb,
  tronAddress: string,
  params: { chainId: number; tokenAddresses: string[]; amounts: string[] },
) =>
  signEnclaveTypedDataTron(tronWeb, tronAddress, (nonce, address) =>
    buildProoflessDepositTypedData({ nonce, address, ...params }),
  );

export const buildDepositForOtherAuthFieldsTron = (
  tronWeb: TronWeb,
  tronAddress: string,
  params: { chainId: number; tokenAddresses: string[]; amounts: string[]; recipientInfo: string },
) =>
  signEnclaveTypedDataTron(tronWeb, tronAddress, (nonce, address) =>
    buildDepositForOtherTypedData({ nonce, address, ...params }),
  );

export const buildTransferAuthFieldsTron = (
  tronWeb: TronWeb,
  tronAddress: string,
  params: { chainId: number; tokenAddresses: string[]; amounts: string[]; recipientAddress: string },
) =>
  signEnclaveTypedDataTron(tronWeb, tronAddress, (nonce, address) =>
    buildTransferTypedData({ nonce, address, ...params }),
  );

export const buildWithdrawAuthFieldsTron = (
  tronWeb: TronWeb,
  tronAddress: string,
  params: { chainId: number; tokenAddresses: string[]; amounts: string[]; recipientAddress: string },
) =>
  signEnclaveTypedDataTron(tronWeb, tronAddress, (nonce, address) =>
    buildWithdrawTypedData({ nonce, address, ...params }),
  );

export const buildSwapAuthFieldsTron = (
  tronWeb: TronWeb,
  tronAddress: string,
  params: { chainId: number; tokenAddresses: string[]; amounts: string[] },
) =>
  signEnclaveTypedDataTron(tronWeb, tronAddress, (nonce, address) => buildSwapTypedData({ nonce, address, ...params }));

export const buildDepositAndWithdrawAuthFieldsTron = (
  tronWeb: TronWeb,
  tronAddress: string,
  params: { chainId: number; tokenAddress: string; recipients: { address: string; amount: string }[] },
) =>
  signEnclaveTypedDataTron(tronWeb, tronAddress, (nonce, address) =>
    buildDepositAndWithdrawTypedData({ nonce, address, ...params }),
  );

export const buildWithdrawStuckUtxosAuthFieldsTron = (
  tronWeb: TronWeb,
  tronAddress: string,
  params: { chainId: number; tokenAddress: string; recipientAddress: string },
) =>
  signEnclaveTypedDataTron(tronWeb, tronAddress, (nonce, address) =>
    buildWithdrawStuckUtxosTypedData({ nonce, address, ...params }),
  );
