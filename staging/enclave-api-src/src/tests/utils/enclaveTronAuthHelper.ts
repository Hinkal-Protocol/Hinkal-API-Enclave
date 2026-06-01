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
  buildTransferTypedData,
  buildWithdrawTypedData,
} from '../../utils/enclaveTypedData';
import { EnclaveTypedDataPayload } from '../../types';
import type { EnclaveAuthFields } from './enclaveAuthHelper';
import type { TronTestWallet } from './tronTestWallet';

const getEthersWallet = (wallet: TronTestWallet): ethers.Wallet => new ethers.Wallet(`0x${wallet.privateKey}`);

/** Plain-message auth for routes using verifySignatureMiddleware (balance, fee structure, etc.). */
export const buildEnclaveTronAuthFields = async (
  wallet: TronTestWallet,
  options?: { writeAccess?: boolean },
): Promise<EnclaveAuthFields> => {
  const nonce = randomUUID();
  const access = options?.writeAccess ? EnclaveSessionAccess.Write : EnclaveSessionAccess.Read;
  const message = buildEnclaveSignMessage(nonce, access);
  const signature = wallet.tronWeb.trx.signMessageV2(message, wallet.privateKey);

  return {
    signature,
    nonce,
    ...(options?.writeAccess ? { writeAccess: true } : {}),
  };
};

export const createEnclaveTronSession = async (
  wallet: TronTestWallet,
  chainId: number,
  options?: { writeAccess?: boolean },
): Promise<EnclaveAuthFields> => {
  const authFields = await buildEnclaveTronAuthFields(wallet, options);
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
  wallet: TronTestWallet,
  buildTypedData: (nonce: string, address: string) => EnclaveTypedDataPayload,
): Promise<EnclaveAuthFields> => {
  const nonce = randomUUID();
  const ethersWallet = getEthersWallet(wallet);
  const { domain, types, value } = buildTypedData(nonce, wallet.address);
  const signature = await ethersWallet.signTypedData(domain, types, value);

  return { signature, nonce };
};

export const buildEnclaveTronDepositAuthFields = (
  wallet: TronTestWallet,
  params: {
    chainId: number;
    tokenAddresses: string[];
    amounts: string[];
  },
) => signEnclaveTypedData(wallet, (nonce, address) => buildDepositTypedData({ nonce, address, ...params }));

export const buildEnclaveTronProoflessDepositAuthFields = (
  wallet: TronTestWallet,
  params: {
    chainId: number;
    tokenAddresses: string[];
    amounts: string[];
  },
) => signEnclaveTypedData(wallet, (nonce, address) => buildProoflessDepositTypedData({ nonce, address, ...params }));

export const buildEnclaveTronTransferAuthFields = (
  wallet: TronTestWallet,
  params: {
    chainId: number;
    tokenAddresses: string[];
    amounts: string[];
    recipientAddress: string;
  },
) => signEnclaveTypedData(wallet, (nonce, address) => buildTransferTypedData({ nonce, address, ...params }));

export const buildEnclaveTronWithdrawAuthFields = (
  wallet: TronTestWallet,
  params: {
    chainId: number;
    tokenAddresses: string[];
    amounts: string[];
    recipientAddress: string;
  },
) => signEnclaveTypedData(wallet, (nonce, address) => buildWithdrawTypedData({ nonce, address, ...params }));

export const buildEnclaveTronDepositForOtherAuthFields = (
  wallet: TronTestWallet,
  params: {
    chainId: number;
    tokenAddresses: string[];
    amounts: string[];
    recipientInfo: string;
  },
) => signEnclaveTypedData(wallet, (nonce, address) => buildDepositForOtherTypedData({ nonce, address, ...params }));

export const buildEnclaveTronDepositAndWithdrawAuthFields = (
  wallet: TronTestWallet,
  params: {
    chainId: number;
    tokenAddress: string;
    recipients: { address: string; amount: string }[];
  },
) => signEnclaveTypedData(wallet, (nonce, address) => buildDepositAndWithdrawTypedData({ nonce, address, ...params }));
