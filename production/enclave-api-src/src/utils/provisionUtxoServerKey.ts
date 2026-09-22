import net from 'net';
import { Logger } from '@hinkal/common';
import { getEnclaveUtxoPrivateKey } from './enclaveUtxoKey';
import { sendRawToUtxoServer, UtxoOpcode } from './utxoServerHelper';
import { UTXO_SERVER_HOST, UTXO_SERVER_PORT } from '../constants';

const UTXO_SERVER_WAIT_TIMEOUT_MS = 60_000;

const waitForUtxoServer = (): Promise<void> =>
  new Promise((resolve, reject) => {
    const deadline = Date.now() + UTXO_SERVER_WAIT_TIMEOUT_MS;

    const attempt = () => {
      const socket = net.createConnection({ host: UTXO_SERVER_HOST, port: UTXO_SERVER_PORT });
      socket.once('connect', () => {
        socket.destroy();
        resolve();
      });
      socket.once('error', () => {
        socket.destroy();
        if (Date.now() >= deadline) {
          reject(new Error(`utxo-server did not accept connections within ${UTXO_SERVER_WAIT_TIMEOUT_MS}ms`));
          return;
        }
        setTimeout(attempt, 500);
      });
    };
    attempt();
  });

export const provisionUtxoServerKey = async (): Promise<void> => {
  await waitForUtxoServer();
  const privateKey = await getEnclaveUtxoPrivateKey();
  const response = JSON.parse((await sendRawToUtxoServer(UtxoOpcode.SET_UTXO_KEY, privateKey)).toString('utf-8')) as {
    success: boolean;
    error?: string;
  };
  if (!response.success) throw new Error(`utxo-server rejected the utxo key: ${response.error}`);
  Logger.log('provisionUtxoServerKey: utxo-server key provisioned');
};
