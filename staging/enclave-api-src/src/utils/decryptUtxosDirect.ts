import { type UtxoDecryptorFn } from '@hinkal/common';
import { sendToUtxoServer } from './utxoServerHelper';

export const decryptUtxosDirect: UtxoDecryptorFn = async (chainId, keysData) => {
  console.log('decryptUtxosDirect', new Date().toISOString());
  const responseBytes = await sendToUtxoServer(chainId, Buffer.from(keysData));
  return JSON.parse(responseBytes.toString('utf-8'));
};
