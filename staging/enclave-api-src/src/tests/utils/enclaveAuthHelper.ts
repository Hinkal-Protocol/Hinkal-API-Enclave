import { randomUUID } from 'crypto';
import { ethers } from 'ethers';
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

export type EnclaveAuthFields = {
  signature: string;
  nonce: string;
  writeAccess?: boolean;
};

export const toEnclaveAuthQueryParams = (
  authFields: EnclaveAuthFields,
  address: string,
  chainId: number,
): Record<string, string> => ({
  signature: authFields.signature,
  nonce: authFields.nonce,
  address,
  chainId: chainId.toString(),
  ...(authFields.writeAccess === true ? { writeAccess: 'true' } : {}),
});

export const buildEnclaveAuthFields = async (
  wallet: ethers.Wallet | ethers.HDNodeWallet,
  options?: { writeAccess?: boolean },
): Promise<EnclaveAuthFields> => {
  const nonce = randomUUID();
  const access = options?.writeAccess ? EnclaveSessionAccess.Write : EnclaveSessionAccess.Read;
  const signature = await wallet.signMessage(buildEnclaveSignMessage(nonce, access));

  return {
    signature,
    nonce,
    ...(options?.writeAccess ? { writeAccess: true } : {}),
  };
};

export const createEnclaveSession = async (
  wallet: ethers.Wallet | ethers.HDNodeWallet,
  chainId: number,
  options?: { writeAccess?: boolean },
): Promise<EnclaveAuthFields> => {
  const authFields = await buildEnclaveAuthFields(wallet, options);
  const response = await httpClient.post<CreateSessionResponse>(`${ENCLAVE_API_URL}/create-session`, {
    ...authFields,
    address: wallet.address,
    chainId,
  });

  if (response.success === false) {
    throw new Error(response.error);
  }

  return authFields;
};

const signEnclaveTypedData = async (
  wallet: ethers.Wallet | ethers.HDNodeWallet,
  buildTypedData: (nonce: string, address: string) => EnclaveTypedDataPayload,
): Promise<EnclaveAuthFields> => {
  const nonce = randomUUID();
  const { domain, types, value } = buildTypedData(nonce, wallet.address);
  const signature = await wallet.signTypedData(domain, types, value);

  return { signature, nonce };
};

export const buildDepositAuthFields = (
  wallet: ethers.Wallet | ethers.HDNodeWallet,
  params: { chainId: number; tokenAddresses: string[]; amounts: string[] },
) => signEnclaveTypedData(wallet, (nonce, address) => buildDepositTypedData({ nonce, address, ...params }));

export const buildProoflessDepositAuthFields = (
  wallet: ethers.Wallet | ethers.HDNodeWallet,
  params: { chainId: number; tokenAddresses: string[]; amounts: string[] },
) => signEnclaveTypedData(wallet, (nonce, address) => buildProoflessDepositTypedData({ nonce, address, ...params }));

export const buildDepositForOtherAuthFields = (
  wallet: ethers.Wallet,
  params: { chainId: number; tokenAddresses: string[]; amounts: string[]; recipientInfo: string },
) => signEnclaveTypedData(wallet, (nonce, address) => buildDepositForOtherTypedData({ nonce, address, ...params }));

export const buildTransferAuthFields = (
  wallet: ethers.Wallet,
  params: {
    chainId: number;
    tokenAddresses: string[];
    amounts: string[];
    recipientAddress: string;
  },
) => signEnclaveTypedData(wallet, (nonce, address) => buildTransferTypedData({ nonce, address, ...params }));

export const buildWithdrawAuthFields = (
  wallet: ethers.Wallet,
  params: {
    chainId: number;
    tokenAddresses: string[];
    amounts: string[];
    recipientAddress: string;
  },
) => signEnclaveTypedData(wallet, (nonce, address) => buildWithdrawTypedData({ nonce, address, ...params }));

export const buildSwapAuthFields = (
  wallet: ethers.Wallet,
  params: {
    chainId: number;
    tokenAddresses: string[];
    amounts: string[];
  },
) => signEnclaveTypedData(wallet, (nonce, address) => buildSwapTypedData({ nonce, address, ...params }));

export const buildDepositAndWithdrawAuthFields = (
  wallet: ethers.Wallet | ethers.HDNodeWallet,
  params: { chainId: number; tokenAddress: string; recipients: { address: string; amount: string }[] },
) => signEnclaveTypedData(wallet, (nonce, address) => buildDepositAndWithdrawTypedData({ nonce, address, ...params }));

export const buildWithdrawStuckUtxosAuthFields = (
  wallet: ethers.Wallet,
  params: { chainId: number; tokenAddress: string; recipientAddress: string },
) => signEnclaveTypedData(wallet, (nonce, address) => buildWithdrawStuckUtxosTypedData({ nonce, address, ...params }));
