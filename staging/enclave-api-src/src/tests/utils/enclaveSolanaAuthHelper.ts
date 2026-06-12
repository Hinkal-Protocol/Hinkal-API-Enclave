import { randomUUID } from 'crypto';
import nacl from 'tweetnacl';
import { ENCLAVE_API_URL, httpClient } from '@hinkal/common';
import { buildEnclaveSignMessage, EnclaveSessionAccess } from '../../constants';
import { CreateSessionResponse } from '../../types/route.types';
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
  TokenAmountsAuthFields,
  TransferLikeAuthFields,
  WithdrawStuckUtxosAuthFields,
} from '../../utils/enclaveAuthNormalization';
import type { EnclaveAuthFields } from './enclaveAuthHelper';
import type { SolanaTestWallet } from './solanaTestWallet';

const signRawMessage = (message: string, wallet: SolanaTestWallet): string => {
  const messageBytes = Buffer.from(message, 'utf8');
  const signature = nacl.sign.detached(messageBytes, wallet.keypair.secretKey);
  return Buffer.from(signature).toString('hex');
};

const buildAuthFields = (message: string, nonce: string, wallet: SolanaTestWallet): EnclaveAuthFields => ({
  signature: signRawMessage(message, wallet),
  nonce,
});

export const buildEnclaveSolanaAuthFields = (
  wallet: SolanaTestWallet,
  options?: { writeAccess?: boolean },
): EnclaveAuthFields => {
  const nonce = randomUUID();
  const access = options?.writeAccess ? EnclaveSessionAccess.Write : EnclaveSessionAccess.Read;
  const authFields = buildAuthFields(buildEnclaveSignMessage(nonce, access), nonce, wallet);
  return options?.writeAccess ? { ...authFields, writeAccess: true } : authFields;
};

export const createEnclaveSolanaSession = async (
  wallet: SolanaTestWallet,
  options?: { writeAccess?: boolean },
): Promise<EnclaveAuthFields> => {
  const authFields = buildEnclaveSolanaAuthFields(wallet, options);
  const response = await httpClient.post<CreateSessionResponse>(`${ENCLAVE_API_URL}/create-session`, {
    ...authFields,
    address: wallet.address,
  });

  if (response.success === false) {
    throw new Error(response.error);
  }

  return authFields;
};

type WithoutNonceAndAddress<T> = Omit<T, 'nonce' | 'address'>;

const withNonce =
  (nonce: string, address: string) =>
  <T extends object>(params: T) => ({ nonce, address, ...params });

export const buildSolanaDepositAuthFields = (
  wallet: SolanaTestWallet,
  params: WithoutNonceAndAddress<TokenAmountsAuthFields>,
): EnclaveAuthFields => {
  const nonce = randomUUID();
  return buildAuthFields(buildSolanaDepositMessage(withNonce(nonce, wallet.address)(params)), nonce, wallet);
};

export const buildSolanaProoflessDepositAuthFields = (
  wallet: SolanaTestWallet,
  params: WithoutNonceAndAddress<TokenAmountsAuthFields>,
): EnclaveAuthFields => {
  const nonce = randomUUID();
  return buildAuthFields(buildSolanaProoflessDepositMessage(withNonce(nonce, wallet.address)(params)), nonce, wallet);
};

export const buildSolanaDepositForOtherAuthFields = (
  wallet: SolanaTestWallet,
  params: WithoutNonceAndAddress<DepositForOtherAuthFields>,
): EnclaveAuthFields => {
  const nonce = randomUUID();
  return buildAuthFields(buildSolanaDepositForOtherMessage(withNonce(nonce, wallet.address)(params)), nonce, wallet);
};

export const buildSolanaTransferAuthFields = (
  wallet: SolanaTestWallet,
  params: WithoutNonceAndAddress<TransferLikeAuthFields>,
): EnclaveAuthFields => {
  const nonce = randomUUID();
  return buildAuthFields(buildSolanaTransferMessage(withNonce(nonce, wallet.address)(params)), nonce, wallet);
};

export const buildSolanaWithdrawAuthFields = (
  wallet: SolanaTestWallet,
  params: WithoutNonceAndAddress<TransferLikeAuthFields>,
): EnclaveAuthFields => {
  const nonce = randomUUID();
  return buildAuthFields(buildSolanaWithdrawMessage(withNonce(nonce, wallet.address)(params)), nonce, wallet);
};

export const buildSolanaSwapAuthFields = (
  wallet: SolanaTestWallet,
  params: WithoutNonceAndAddress<TokenAmountsAuthFields>,
): EnclaveAuthFields => {
  const nonce = randomUUID();
  return buildAuthFields(buildSolanaSwapMessage(withNonce(nonce, wallet.address)(params)), nonce, wallet);
};

export const buildSolanaPrivateSendAuthFields = (
  wallet: SolanaTestWallet,
  params: WithoutNonceAndAddress<PrivateSendAuthFields>,
): EnclaveAuthFields => {
  const nonce = randomUUID();
  return buildAuthFields(buildSolanaPrivateSendMessage(withNonce(nonce, wallet.address)(params)), nonce, wallet);
};

export const buildSolanaWithdrawStuckUtxosAuthFields = (
  wallet: SolanaTestWallet,
  params: WithoutNonceAndAddress<WithdrawStuckUtxosAuthFields>,
): EnclaveAuthFields => {
  const nonce = randomUUID();
  return buildAuthFields(buildSolanaWithdrawStuckUtxosMessage(withNonce(nonce, wallet.address)(params)), nonce, wallet);
};
