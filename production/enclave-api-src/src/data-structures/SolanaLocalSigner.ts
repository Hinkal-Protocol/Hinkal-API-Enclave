import {
  Connection,
  Keypair,
  PublicKey,
  Transaction,
  TransactionInstruction,
  VersionedTransaction,
} from '@solana/web3.js';
import bs58 from 'bs58';
import nacl from 'tweetnacl';
import { SolanaWallet } from '@hinkal/common/types/solana.types';
import { sendV1Transaction, THROWN_ERROR_MESSAGES } from '@hinkal/common';

export class SolanaLocalSigner implements SolanaWallet {
  private readonly keypair: Keypair;

  constructor(secretKeyBase58: string, publicKeyBase58: string) {
    this.keypair = Keypair.fromSecretKey(bs58.decode(secretKeyBase58));
    if (this.keypair.publicKey.toBase58() !== publicKeyBase58) {
      throw new Error(THROWN_ERROR_MESSAGES.SOLANA_KEYPAIR_DOES_NOT_MATCH_WALLET_ADDRESS);
    }
  }

  get publicKey(): PublicKey {
    return this.keypair.publicKey;
  }

  async signTransaction<T extends Transaction | VersionedTransaction>(tx: T): Promise<T> {
    if (tx instanceof Transaction) {
      tx.partialSign(this.keypair);
    } else {
      tx.sign([this.keypair]);
    }
    return tx;
  }

  async signAllTransactions<T extends Transaction | VersionedTransaction>(txs: T[]): Promise<T[]> {
    return Promise.all(txs.map((tx) => this.signTransaction(tx)));
  }

  async sendV1Transaction(connection: Connection, instructions: TransactionInstruction[]): Promise<string> {
    return sendV1Transaction(connection, instructions, this.keypair);
  }

  async signMessage(message: Uint8Array): Promise<{ signature: Uint8Array; publicKey: PublicKey }> {
    const signature = nacl.sign.detached(message, this.keypair.secretKey);
    return { signature, publicKey: this.keypair.publicKey };
  }
}
