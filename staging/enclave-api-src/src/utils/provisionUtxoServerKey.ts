import net from 'net';
import { Logger } from '@hinkal/common';
import { getEnclaveUtxoPrivateKey } from './enclaveUtxoKey';
import { sendRawToUtxoServer, UtxoOpcode } from './utxoServerHelper';

const HOST = '127.0.0.1';
const PORT = 7000;
const UTXO_SERVER_WAIT_TIMEOUT_MS = 60_000;

const waitForUtxoServer = (): Promise<void> =>
  new Promise((resolve, reject) => {
    const deadline = Date.now() + UTXO_SERVER_WAIT_TIMEOUT_MS;

    const attempt = () => {
      const socket = net.createConnection({ host: HOST, port: PORT });
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
  await sendRawToUtxoServer(UtxoOpcode.SET_UTXO_KEY, privateKey);
  Logger.log('provisionUtxoServerKey: utxo-server key provisioned');
};
