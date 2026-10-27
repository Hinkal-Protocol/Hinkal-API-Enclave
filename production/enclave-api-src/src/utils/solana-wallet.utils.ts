import {
  Connection,
  PublicKey,
  TransactionInstruction,
  TransactionMessage,
  VersionedTransaction,
} from '@solana/web3.js';
import { buildSolanaTransferInstructions } from '@hinkal/common/functions/pre-transaction/solanaTransfer.utils';
import { ERC20Token } from '@hinkal/common/types/token.types';
import { networkRegistry } from '@hinkal/common';
import { SolanaLocalSigner } from '../data-structures';
import { walletSecretsService } from '../services/walletSecretsService';

export const buildSolanaSigner = async (
  signerPublicKey: string,
  organizationId: string,
  userId: string,
  walletAddress: string,
  chainId: number,
): Promise<{ signer: SolanaLocalSigner; connection: Connection }> => {
  const { rpcUrl } = networkRegistry[chainId];

  const { childWallet } = await walletSecretsService.getSeedHashAndChildWallet(
    organizationId,
    userId,
    signerPublicKey,
    walletAddress,
  );

  const connection = new Connection(rpcUrl, 'confirmed');
  const signer = new SolanaLocalSigner(childWallet.solana.secretKey, childWallet.solana.publicKey);
  return { signer, connection };
};

export const buildSolanaTransferInstructionsForSend = async (
  connection: Connection,
  fromPubkey: PublicKey,
  toPubkey: PublicKey,
  token: ERC20Token,
  amount: bigint,
): Promise<TransactionInstruction[]> => {
  const { instructions } = await buildSolanaTransferInstructions(connection, fromPubkey, toPubkey, token, amount);
  return instructions;
};

export const signAndSendSerializedSolanaTransaction = async (
  connection: Connection,
  signer: SolanaLocalSigner,
  serializedTransactionBase64: string,
): Promise<string> => {
  const { message } = VersionedTransaction.deserialize(Buffer.from(serializedTransactionBase64, 'base64'));
  if (message.header.numRequiredSignatures !== 1 || !message.staticAccountKeys[0]?.equals(signer.publicKey)) {
    throw new Error('Solana transaction must have the enclave wallet as its only signer and fee payer');
  }
  const addressLookupTableAccounts = await Promise.all(
    message.addressTableLookups.map(async ({ accountKey }) => {
      const { value } = await connection.getAddressLookupTable(accountKey);
      if (!value) throw new Error(`Failed to fetch lookup table: ${accountKey.toBase58()}`);
      return value;
    }),
  );
  const { instructions } = TransactionMessage.decompile(message, { addressLookupTableAccounts });
  return signer.sendV1Transaction(connection, instructions);
};
