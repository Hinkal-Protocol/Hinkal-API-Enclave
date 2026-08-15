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

export const buildAndSendSolanaTransaction = async (
  connection: Connection,
  signer: SolanaLocalSigner,
  instructions: TransactionInstruction[],
): Promise<string> => {
  const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash();
  const message = new TransactionMessage({
    payerKey: signer.publicKey,
    recentBlockhash: blockhash,
    instructions,
  }).compileToV0Message();

  const tx = new VersionedTransaction(message);
  const signed = await signer.signTransaction(tx);
  const signature = await connection.sendRawTransaction(signed.serialize());
  await connection.confirmTransaction({ signature, blockhash, lastValidBlockHeight }, 'confirmed');
  return signature;
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
  const txBuffer = Buffer.from(serializedTransactionBase64, 'base64');
  const tx = VersionedTransaction.deserialize(txBuffer);
  const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash();
  tx.message.recentBlockhash = blockhash;
  const signed = await signer.signTransaction(tx);
  const signature = await connection.sendRawTransaction(signed.serialize());
  await connection.confirmTransaction({ signature, blockhash, lastValidBlockHeight }, 'confirmed');
  return signature;
};
