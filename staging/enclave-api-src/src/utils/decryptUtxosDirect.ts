import { Logger, type UtxoDecryptorFn } from '@hinkal/common';
import { sendToUtxoServer, UtxoOpcode } from './utxoServerHelper';

export const decryptUtxosDirect: UtxoDecryptorFn = async (chainId, keysData) => {
  Logger.log('decryptUtxosDirect: sending to enclave', { chainId, opcode: UtxoOpcode.GET_BALANCE });

  const responseBytes = await sendToUtxoServer(chainId, Buffer.from(keysData), UtxoOpcode.GET_BALANCE);
  const result = JSON.parse(responseBytes.toString('utf-8'));

  Logger.log('decryptUtxosDirect: enclave result', {
    chainId,
    utxoCount: result.utxos?.length,
    encryptedOutputCount: result.encryptedOutputs?.length,
    lastOutput: result.lastOutput,
  });

  return result;
};
