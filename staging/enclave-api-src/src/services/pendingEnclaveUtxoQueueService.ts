import {
  deserializeUtxoConstructorParams,
  IUtxoConstructor,
  Logger,
  PendingEnclaveUtxo,
  serializeUtxoConstructorParams,
  storeUtxoInEnclave,
  Utxo,
} from '@hinkal/common';
import { PendingEnclaveUtxoModel } from '../models/PendingEnclaveUtxoSchema';

const RETRY_INTERVAL_MS = 10_000;

type QueueItem = {
  chainId: number;
  senderAddress: string;
  recipientAddress: string;
  utxo: IUtxoConstructor<string>;
};

class PendingEnclaveUtxoQueueService {
  private intervalId: NodeJS.Timeout | null = null;

  private isFlushing = false;

  private getQueueItemKey(item: QueueItem): string {
    return [
      item.chainId,
      item.senderAddress.toLowerCase(),
      item.recipientAddress.toLowerCase(),
      item.utxo.erc20TokenAddress.toLowerCase(),
      item.utxo.mintAddress ?? '',
      item.utxo.tokenId ?? 0,
      item.utxo.stealthAddress ?? '',
      item.utxo.randomization ?? '',
      item.utxo.amount,
    ].join(':');
  }

  async enqueue(items: PendingEnclaveUtxo[]): Promise<void> {
    if (items.length === 0) return;

    await Promise.all(
      items.map((item) => {
        const utxo = serializeUtxoConstructorParams(item.utxo.getConstructableParams());
        const queueItem: QueueItem = {
          chainId: item.chainId,
          senderAddress: item.senderAddress,
          recipientAddress: item.recipientAddress,
          utxo,
        };
        const dedupKey = this.getQueueItemKey(queueItem);

        return PendingEnclaveUtxoModel.updateOne(
          { dedupKey },
          { $setOnInsert: { ...queueItem, dedupKey, attempts: 0 } },
          { upsert: true },
        );
      }),
    );
  }

  async flush(): Promise<void> {
    if (this.isFlushing) return;
    this.isFlushing = true;

    try {
      const queued = await PendingEnclaveUtxoModel.find().lean();
      if (queued.length === 0) return;

      await Promise.all(
        queued.map(async (doc) => {
          try {
            const utxo = new Utxo(deserializeUtxoConstructorParams(doc.utxo as IUtxoConstructor<string>));
            await storeUtxoInEnclave(doc.senderAddress, doc.recipientAddress, utxo, doc.chainId);
            await PendingEnclaveUtxoModel.deleteOne({ _id: doc._id });
          } catch (err) {
            await PendingEnclaveUtxoModel.updateOne({ _id: doc._id }, { $inc: { attempts: 1 } });
            Logger.log('Flush failed for item, will retry', { err });
          }
        }),
      );
    } finally {
      this.isFlushing = false;
    }
  }

  async enqueueAndFlush(items: PendingEnclaveUtxo[]): Promise<void> {
    await this.enqueue(items);
    this.flush().catch((err) => Logger.log('Background flush failed', { err }));
  }

  init(): void {
    if (this.intervalId) return;
    this.flush().catch((err) => Logger.log('Initial flush failed', { err }));
    this.intervalId = setInterval(() => {
      this.flush().catch((err) => Logger.log('Interval flush failed', { err }));
    }, RETRY_INTERVAL_MS);
  }
}

export const pendingEnclaveUtxoQueueService = new PendingEnclaveUtxoQueueService();
