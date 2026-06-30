import { createHash, randomBytes, randomUUID } from 'crypto';
import { secp256k1 } from '@noble/curves/secp256k1';
import { ethers } from 'ethers';
import { ENCLAVE_API_URL, httpClient } from '@hinkal/common';
import {
  buildEnclaveSignMessage,
  EnclaveSessionAuthMode,
  HEADER_REQUEST_SIGNATURE,
  resolveSessionAuthMode,
} from '../../constants';
import type { SerializedFeeStructure } from '../../utils/enclaveAuthNormalization';
import { CreateSessionResponse } from '../../types/route.types';
import { EnclaveTypedDataPayload } from '../../types';
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

// --- Types ---

export type EnclaveSessionAuthFields = {
  sessionId: string;
  privateKey: Uint8Array;
  useEIP712?: boolean;
};

export type EnclaveTxAuthFields = {
  signature: string;
  nonce: string;
  sessionId: string;
  timestamp: number;
};

// --- Secp256k1 signing ---

const toHex = (bytes: Uint8Array): string => Buffer.from(bytes).toString('hex');

const signPayload = (privateKey: Uint8Array, payload: string): string => {
  const msgHash = new Uint8Array(createHash('sha256').update(payload).digest());
  return toHex(secp256k1.sign(msgHash, privateKey).toBytes('compact'));
};

export const requestSignatureGetHeader = (
  session: EnclaveSessionAuthFields,
  queryString: string,
): Record<string, string> => ({
  [HEADER_REQUEST_SIGNATURE]: signPayload(session.privateKey, queryString),
});

export const requestSignaturePostHeader = (
  session: EnclaveSessionAuthFields,
  body: Record<string, unknown>,
): Record<string, string> => ({
  [HEADER_REQUEST_SIGNATURE]: signPayload(session.privateKey, JSON.stringify(body)),
});

// --- Session params helpers ---

export const sessionQueryParams = (session: EnclaveSessionAuthFields, chainId: number): Record<string, string> => ({
  sessionId: session.sessionId,
  nonce: randomUUID(),
  chainId: chainId.toString(),
  timestamp: Date.now().toString(),
});

export const sessionBodyParams = (
  session: EnclaveSessionAuthFields,
  chainId: number,
): { sessionId: string; nonce: string; chainId: number; timestamp: number } => ({
  sessionId: session.sessionId,
  nonce: randomUUID(),
  chainId,
  timestamp: Date.now(),
});

// --- Typed-data signing (EIP-712 mode) ---

const signEnclaveTypedData = async (
  sessionId: string,
  wallet: ethers.Wallet | ethers.HDNodeWallet,
  buildTypedData: (nonce: string, sessionId: string) => EnclaveTypedDataPayload,
): Promise<EnclaveTxAuthFields> => {
  const nonce = randomUUID();
  const { domain, types, value } = buildTypedData(nonce, sessionId);
  const signature = await wallet.signTypedData(domain, types, value);

  return { sessionId, signature, nonce, timestamp: Date.now() };
};

export const buildDepositAuthFields = (
  session: { sessionId: string },
  wallet: ethers.Wallet | ethers.HDNodeWallet,
  params: { chainId: number; tokenAddresses: string[]; amounts: string[] },
) =>
  signEnclaveTypedData(session.sessionId, wallet, (nonce, sessionId) =>
    buildDepositTypedData({ nonce, sessionId, ...params }),
  );

export const buildProoflessDepositAuthFields = (
  session: { sessionId: string },
  wallet: ethers.Wallet | ethers.HDNodeWallet,
  params: { chainId: number; tokenAddresses: string[]; amounts: string[] },
) =>
  signEnclaveTypedData(session.sessionId, wallet, (nonce, sessionId) =>
    buildProoflessDepositTypedData({ nonce, sessionId, ...params }),
  );

export const buildDepositForOtherAuthFields = (
  session: { sessionId: string },
  wallet: ethers.Wallet,
  params: { chainId: number; tokenAddresses: string[]; amounts: string[]; recipientInfo: string },
) =>
  signEnclaveTypedData(session.sessionId, wallet, (nonce, sessionId) =>
    buildDepositForOtherTypedData({ nonce, sessionId, ...params }),
  );

export const buildTransferAuthFields = (
  session: { sessionId: string },
  wallet: ethers.Wallet,
  params: {
    chainId: number;
    tokenAddresses: string[];
    amounts: string[];
    recipientAddress: string;
    feeToken?: string;
    feeStructure?: SerializedFeeStructure;
  },
) =>
  signEnclaveTypedData(session.sessionId, wallet, (nonce, sessionId) =>
    buildTransferTypedData({ nonce, sessionId, ...params }),
  );

export const buildWithdrawAuthFields = (
  session: { sessionId: string },
  wallet: ethers.Wallet,
  params: {
    chainId: number;
    tokenAddresses: string[];
    amounts: string[];
    recipientAddress: string;
    feeToken?: string;
    feeStructure?: SerializedFeeStructure;
  },
) =>
  signEnclaveTypedData(session.sessionId, wallet, (nonce, sessionId) =>
    buildWithdrawTypedData({ nonce, sessionId, ...params }),
  );

export const buildSwapAuthFields = (
  session: { sessionId: string },
  wallet: ethers.Wallet,
  params: {
    chainId: number;
    tokenAddresses: string[];
    amounts: string[];
    externalActionId: string;
    swapData: string;
    feeToken?: string;
    feeStructure?: SerializedFeeStructure;
  },
) =>
  signEnclaveTypedData(session.sessionId, wallet, (nonce, sessionId) =>
    buildSwapTypedData({ nonce, sessionId, ...params }),
  );

export const buildDepositAndWithdrawAuthFields = (
  session: { sessionId: string },
  wallet: ethers.Wallet | ethers.HDNodeWallet,
  params: {
    chainId: number;
    tokenAddress: string;
    recipients: { address: string; amount: string }[];
    feeToken?: string;
    txCompletionTime?: number;
    ref?: string;
  },
) =>
  signEnclaveTypedData(session.sessionId, wallet, (nonce, sessionId) =>
    buildDepositAndWithdrawTypedData({ nonce, sessionId, ...params }),
  );

export const buildWithdrawStuckUtxosAuthFields = (
  session: { sessionId: string },
  wallet: ethers.Wallet,
  params: { chainId: number; tokenAddress: string; recipientAddress: string },
) =>
  signEnclaveTypedData(session.sessionId, wallet, (nonce, sessionId) =>
    buildWithdrawStuckUtxosTypedData({ nonce, sessionId, ...params }),
  );

// --- buildAuthPost ---

export const buildAuthPost = async (
  session: EnclaveSessionAuthFields,
  chainId: number,
  txData: Record<string, unknown>,
  buildTypedDataAuth: () => Promise<EnclaveTxAuthFields>,
): Promise<{ body: Record<string, unknown>; headers?: Record<string, string> }> => {
  if (!session.useEIP712) {
    const body = { ...sessionBodyParams(session, chainId), ...txData };
    return { body, headers: requestSignaturePostHeader(session, body) };
  }
  const authFields = await buildTypedDataAuth();
  return { body: { ...authFields, ...txData } };
};

export const resolveTestUseEIP712 = (): boolean => {
  const mode = (process.env['ENCLAVE_TEST_AUTH_MODE'] ?? EnclaveSessionAuthMode.Normal).toLowerCase();
  if (mode === EnclaveSessionAuthMode.EIP712) return true;
  if (mode === EnclaveSessionAuthMode.Normal) return false;
  throw new Error(
    `ENCLAVE_TEST_AUTH_MODE must be "${EnclaveSessionAuthMode.Normal}" or "${EnclaveSessionAuthMode.EIP712}", got "${mode}"`,
  );
};

// --- Session creation ---

export const createEnclaveSessionFromSignature = async (
  signature: string,
  address: string,
  sessionId: string,
  privateKey: Uint8Array,
  useEIP712: boolean,
): Promise<EnclaveSessionAuthFields> => {
  const clientPublicKey = toHex(secp256k1.getPublicKey(privateKey, true));
  const body = {
    signature,
    address,
    sessionId,
    clientPublicKey,
    nonce: randomUUID(),
    useEIP712,
  };

  const response = await httpClient.post<CreateSessionResponse>(`${ENCLAVE_API_URL}/create-session`, body, {
    headers: { [HEADER_REQUEST_SIGNATURE]: signPayload(privateKey, JSON.stringify(body)) },
  });
  if (response.success === false) throw new Error(response.error);
  return { sessionId, privateKey, useEIP712 };
};

export const createEnclaveSession = async (
  wallet: ethers.Wallet | ethers.HDNodeWallet,
): Promise<EnclaveSessionAuthFields> => {
  const useEIP712 = resolveTestUseEIP712();
  const privateKey = new Uint8Array(randomBytes(32));
  const clientPublicKey = toHex(secp256k1.getPublicKey(privateKey, true));
  const sessionId = randomUUID();
  const authMode = resolveSessionAuthMode(useEIP712);
  const signature = await wallet.signMessage(buildEnclaveSignMessage(sessionId, clientPublicKey, authMode));
  return createEnclaveSessionFromSignature(signature, wallet.address, sessionId, privateKey, useEIP712);
};
