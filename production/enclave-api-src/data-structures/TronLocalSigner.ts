import { createTronWeb, normalizeTronPrivateKey } from '@hinkal/common/functions/utils/tron.utils';
import { TronSignerAdapter } from '@hinkal/common/types/tron.types';

export class TronLocalSigner implements TronSignerAdapter {
  private readonly privateKey: string;

  constructor(
    privateKey: string,
    private readonly chainId: number,
  ) {
    this.privateKey = normalizeTronPrivateKey(privateKey);
  }

  on(): this {
    return this;
  }

  off(): this {
    return this;
  }

  async signTransaction(transaction: unknown): Promise<unknown> {
    const tronWeb = createTronWeb(this.chainId);
    return tronWeb.trx.sign(transaction as Parameters<typeof tronWeb.trx.sign>[0], this.privateKey);
  }

  async signMessage(message: string): Promise<string> {
    const tronWeb = createTronWeb(this.chainId);
    return tronWeb.trx.signMessageV2(message, this.privateKey);
  }
}
