import { randomBytes, randomUUID } from 'crypto';
import { TronWeb } from 'tronweb';
import { secp256k1 } from '@noble/curves/secp256k1';
import { buildEnclaveSignMessage, resolveSessionAuthMode } from '../../constants';
import { EnclaveTypedDataPayload } from '../../types';
import {
  buildDepositAndWithdrawTypedData,
  buildDepositForOtherTypedData,
  buildDepositTypedData,
  buildProoflessDepositTypedData,
  buildTransferTypedData,
  buildWithdrawStuckUtxosTypedData,
  buildWithdrawTypedData,
} from '../../utils/enclaveTypedData';
import type { SerializedFeeStructure } from '../../utils/enclaveAuthNormalization';
import {
  createEnclaveSessionFromSignature,
  type EnclaveSessionAuthFields,
  type EnclaveTxAuthFields,
  requestSignaturePostHeader,
  resolveTestUseEIP712,
  sessionBodyParams,
} from './enclaveAuthHelper';

const toHex = (bytes: Uint8Array): string => Buffer.from(bytes).toString('hex');

export const createEnclaveSessionTron = async (
  tronWeb: TronWeb,
  tronAddress: string,
): Promise<EnclaveSessionAuthFields> => {
  const useEIP712 = resolveTestUseEIP712();
  const privateKey = new Uint8Array(randomBytes(32));
  const clientPublicKey = toHex(secp256k1.getPublicKey(privateKey, true));
  const sessionId = randomUUID();
  const authMode = resolveSessionAuthMode(useEIP712);
  const signature = tronWeb.trx.signMessageV2(buildEnclaveSignMessage(sessionId, clientPublicKey, authMode));
  return createEnclaveSessionFromSignature(signature, tronAddress, sessionId, privateKey, useEIP712);
};

const signEnclaveTypedDataTron = (
  sessionId: string,
  tronWeb: TronWeb,
  buildTypedData: (nonce: string, sessionId: string) => EnclaveTypedDataPayload,
): EnclaveTxAuthFields => {
  const nonce = randomUUID();
  const { domain, types, value } = buildTypedData(nonce, sessionId);
  const signature = tronWeb.trx.signTypedData(domain, types, value);
  return { sessionId, signature, nonce, timestamp: Date.now() };
};

export const buildAuthPostTron = (
  session: EnclaveSessionAuthFields,
  chainId: number,
  txData: Record<string, unknown>,
  buildTypedDataAuth: () => EnclaveTxAuthFields,
): { body: Record<string, unknown>; headers?: Record<string, string> } => {
  if (!session.useEIP712) {
    const body = { ...sessionBodyParams(session, chainId), ...txData };
    return { body, headers: requestSignaturePostHeader(session, body) };
  }
  const authFields = buildTypedDataAuth();
  return { body: { ...authFields, ...txData } };
};

export const buildDepositAuthFieldsTron = (
  session: { sessionId: string },
  tronWeb: TronWeb,
  params: { chainId: number; tokenAddresses: string[]; amounts: string[] },
) =>
  signEnclaveTypedDataTron(session.sessionId, tronWeb, (nonce, sessionId) =>
    buildDepositTypedData({ nonce, sessionId, ...params }),
  );

export const buildProoflessDepositAuthFieldsTron = (
  session: { sessionId: string },
  tronWeb: TronWeb,
  params: { chainId: number; tokenAddresses: string[]; amounts: string[] },
) =>
  signEnclaveTypedDataTron(session.sessionId, tronWeb, (nonce, sessionId) =>
    buildProoflessDepositTypedData({ nonce, sessionId, ...params }),
  );

export const buildDepositForOtherAuthFieldsTron = (
  session: { sessionId: string },
  tronWeb: TronWeb,
  params: { chainId: number; tokenAddresses: string[]; amounts: string[]; recipientInfo: string },
) =>
  signEnclaveTypedDataTron(session.sessionId, tronWeb, (nonce, sessionId) =>
    buildDepositForOtherTypedData({ nonce, sessionId, ...params }),
  );

export const buildTransferAuthFieldsTron = (
  session: { sessionId: string },
  tronWeb: TronWeb,
  params: {
    chainId: number;
    tokenAddresses: string[];
    amounts: string[];
    recipientAddress: string;
    feeToken?: string;
    feeStructure?: SerializedFeeStructure;
  },
) =>
  signEnclaveTypedDataTron(session.sessionId, tronWeb, (nonce, sessionId) =>
    buildTransferTypedData({ nonce, sessionId, ...params }),
  );

export const buildWithdrawAuthFieldsTron = (
  session: { sessionId: string },
  tronWeb: TronWeb,
  params: {
    chainId: number;
    tokenAddresses: string[];
    amounts: string[];
    recipientAddress: string;
    feeToken?: string;
    feeStructure?: SerializedFeeStructure;
  },
) =>
  signEnclaveTypedDataTron(session.sessionId, tronWeb, (nonce, sessionId) =>
    buildWithdrawTypedData({ nonce, sessionId, ...params }),
  );

export const buildDepositAndWithdrawAuthFieldsTron = (
  session: { sessionId: string },
  tronWeb: TronWeb,
  params: {
    chainId: number;
    tokenAddress: string;
    recipients: { address: string; amount: string }[];
    feeToken?: string;
    txCompletionTime?: number;
  },
) =>
  signEnclaveTypedDataTron(session.sessionId, tronWeb, (nonce, sessionId) =>
    buildDepositAndWithdrawTypedData({ nonce, sessionId, ...params }),
  );

export const buildWithdrawStuckUtxosAuthFieldsTron = (
  session: { sessionId: string },
  tronWeb: TronWeb,
  params: { chainId: number; tokenAddress: string; recipientAddress: string },
) =>
  signEnclaveTypedDataTron(session.sessionId, tronWeb, (nonce, sessionId) =>
    buildWithdrawStuckUtxosTypedData({ nonce, sessionId, ...params }),
  );
