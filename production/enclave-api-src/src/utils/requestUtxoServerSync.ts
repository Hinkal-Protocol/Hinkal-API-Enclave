import { getErrorMessage, Logger } from '@hinkal/common';
import { sendToUtxoServer, UtxoOpcode } from './utxoServerHelper';

export const requestUtxoServerSync = (chainId: number) =>
  sendToUtxoServer(UtxoOpcode.REQUEST_SYNC, chainId).catch((err) =>
    Logger.error(`requestUtxoServerSync failed for chain ${chainId}:`, getErrorMessage(err)),
  );
