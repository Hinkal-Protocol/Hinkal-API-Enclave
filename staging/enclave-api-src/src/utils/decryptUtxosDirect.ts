import { type UtxoDecryptorFn } from '@hinkal/common';
import { sendToUtxoServer, UtxoOpcode } from './utxoServerHelper';

export const decryptUtxosDirect: UtxoDecryptorFn = async (chainId, keysData) => {
  const responseBytes = await sendToUtxoServer(UtxoOpcode.GET_BALANCE, chainId, Buffer.from(keysData));
  return JSON.parse(responseBytes.toString('utf-8'));
};
