import {
  buildEnclaveSignMessage,
  EnclaveSessionAuthFields,
  resolveSessionAuthMode,
  sessionBodyParams,
} from '@hinkal/common';
import { randomBytes, randomUUID } from 'crypto';
import nacl from 'tweetnacl';
import {
  buildSolanaDepositForOtherMessage,
  buildSolanaDepositMessage,
  buildSolanaPrivateSendMessage,
  buildSolanaProoflessDepositMessage,
  buildSolanaSwapMessage,
  buildSolanaTransferMessage,
  buildSolanaWithdrawMessage,
  buildSolanaWithdrawStuckUtxosMessage,
} from '../../utils/enclaveSolanaMessage';
import type {
  DepositForOtherAuthFields,
  PrivateSendAuthFields,
  SwapAuthFields,
  TokenAmountsAuthFields,
  TransferLikeAuthFields,
  WithdrawStuckUtxosAuthFields,
} from '../../utils/enclaveAuthNormalization';
import {
  createEnclaveSessionFromSignature,
  type EnclaveTxAuthFields,
  requestSignaturePostHeader,
  resolveTestUseEIP712,
} from './enclaveAuthHelper';
import type { SolanaTestWallet } from './solanaTestWallet';
import { secp256k1 } from '@noble/curves/secp256k1';

const toHex = (bytes: Uint8Array): string => Buffer.from(bytes).toString('hex');

const signRawMessage = (message: string, wallet: SolanaTestWallet): string => {
  const messageBytes = Buffer.from(message, 'utf8');
  const signature = nacl.sign.detached(messageBytes, wallet.keypair.secretKey);
  return Buffer.from(signature).toString('hex');
};

const buildTxAuthFields = (
  sessionId: string,
  message: string,
  nonce: string,
  wallet: SolanaTestWallet,
): EnclaveTxAuthFields => ({
  sessionId,
  signature: signRawMessage(message, wallet),
  nonce,
  timestamp: Date.now(),
});

export const createEnclaveSolanaSession = async (wallet: SolanaTestWallet): Promise<EnclaveSessionAuthFields> => {
  const useEIP712 = resolveTestUseEIP712();
  const privateKey = new Uint8Array(randomBytes(32));
  const clientPublicKey = toHex(secp256k1.getPublicKey(privateKey, true));
  const sessionId = randomUUID();
  const authMode = resolveSessionAuthMode(useEIP712);
  const signature = signRawMessage(buildEnclaveSignMessage(sessionId, clientPublicKey, authMode), wallet);
  return createEnclaveSessionFromSignature(signature, wallet.address, sessionId, privateKey, useEIP712);
};

export const buildAuthPostSolana = (
  session: EnclaveSessionAuthFields,
  chainId: number,
  routePath: string,
  txData: Record<string, unknown>,
  buildTypedDataAuth: () => EnclaveTxAuthFields,
): { body: Record<string, unknown>; headers?: Record<string, string> } => {
  if (!session.useEIP712) {
    const body = { ...sessionBodyParams(session, chainId), ...txData };
    return { body, headers: requestSignaturePostHeader(session, routePath, body) };
  }
  const authFields = buildTypedDataAuth();
  return { body: { ...authFields, ...txData } };
};

type WithoutNonceAndSessionId<T> = Omit<T, 'nonce' | 'sessionId'>;

const withNonceAndSessionId =
  (nonce: string, sessionId: string) =>
  <T extends object>(params: T) => ({ nonce, sessionId, ...params });

export const buildSolanaDepositAuthFields = (
  session: { sessionId: string },
  wallet: SolanaTestWallet,
  params: WithoutNonceAndSessionId<TokenAmountsAuthFields>,
): EnclaveTxAuthFields => {
  const nonce = randomUUID();
  return buildTxAuthFields(
    session.sessionId,
    buildSolanaDepositMessage(withNonceAndSessionId(nonce, session.sessionId)(params)),
    nonce,
    wallet,
  );
};

export const buildSolanaProoflessDepositAuthFields = (
  session: { sessionId: string },
  wallet: SolanaTestWallet,
  params: WithoutNonceAndSessionId<TokenAmountsAuthFields>,
): EnclaveTxAuthFields => {
  const nonce = randomUUID();
  return buildTxAuthFields(
    session.sessionId,
    buildSolanaProoflessDepositMessage(withNonceAndSessionId(nonce, session.sessionId)(params)),
    nonce,
    wallet,
  );
};

export const buildSolanaDepositForOtherAuthFields = (
  session: { sessionId: string },
  wallet: SolanaTestWallet,
  params: WithoutNonceAndSessionId<DepositForOtherAuthFields>,
): EnclaveTxAuthFields => {
  const nonce = randomUUID();
  return buildTxAuthFields(
    session.sessionId,
    buildSolanaDepositForOtherMessage(withNonceAndSessionId(nonce, session.sessionId)(params)),
    nonce,
    wallet,
  );
};

export const buildSolanaTransferAuthFields = (
  session: { sessionId: string },
  wallet: SolanaTestWallet,
  params: WithoutNonceAndSessionId<TransferLikeAuthFields>,
): EnclaveTxAuthFields => {
  const nonce = randomUUID();
  return buildTxAuthFields(
    session.sessionId,
    buildSolanaTransferMessage(withNonceAndSessionId(nonce, session.sessionId)(params)),
    nonce,
    wallet,
  );
};

export const buildSolanaWithdrawAuthFields = (
  session: { sessionId: string },
  wallet: SolanaTestWallet,
  params: WithoutNonceAndSessionId<TransferLikeAuthFields>,
): EnclaveTxAuthFields => {
  const nonce = randomUUID();
  return buildTxAuthFields(
    session.sessionId,
    buildSolanaWithdrawMessage(withNonceAndSessionId(nonce, session.sessionId)(params)),
    nonce,
    wallet,
  );
};

export const buildSolanaSwapAuthFields = (
  session: { sessionId: string },
  wallet: SolanaTestWallet,
  params: WithoutNonceAndSessionId<SwapAuthFields>,
): EnclaveTxAuthFields => {
  const nonce = randomUUID();
  return buildTxAuthFields(
    session.sessionId,
    buildSolanaSwapMessage(withNonceAndSessionId(nonce, session.sessionId)(params)),
    nonce,
    wallet,
  );
};

export const buildSolanaPrivateSendAuthFields = (
  session: { sessionId: string },
  wallet: SolanaTestWallet,
  params: WithoutNonceAndSessionId<PrivateSendAuthFields>,
): EnclaveTxAuthFields => {
  const nonce = randomUUID();
  return buildTxAuthFields(
    session.sessionId,
    buildSolanaPrivateSendMessage(withNonceAndSessionId(nonce, session.sessionId)(params)),
    nonce,
    wallet,
  );
};

export const buildSolanaWithdrawStuckUtxosAuthFields = (
  session: { sessionId: string },
  wallet: SolanaTestWallet,
  params: WithoutNonceAndSessionId<WithdrawStuckUtxosAuthFields>,
): EnclaveTxAuthFields => {
  const nonce = randomUUID();
  return buildTxAuthFields(
    session.sessionId,
    buildSolanaWithdrawStuckUtxosMessage(withNonceAndSessionId(nonce, session.sessionId)(params)),
    nonce,
    wallet,
  );
};
