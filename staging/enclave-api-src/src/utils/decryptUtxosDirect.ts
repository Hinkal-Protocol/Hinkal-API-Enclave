import { type UtxoDecryptorFn } from '@hinkal/common';
import { sendToUtxoServer, UtxoOpcode } from './utxoServerHelper';

export const decryptUtxosDirect: UtxoDecryptorFn = async (chainId, keysData) => {
  const responseBytes = await sendToUtxoServer(chainId, Buffer.from(keysData), UtxoOpcode.GET_BALANCE);
  return JSON.parse(responseBytes.toString('utf-8'));
};
