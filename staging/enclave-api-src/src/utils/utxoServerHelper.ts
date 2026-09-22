import net from 'net';
import { UTXO_SERVER_HOST, UTXO_SERVER_PORT } from '../constants';

export enum UtxoOpcode {
  GET_BALANCE = 0,
  SET_UTXO_KEY = 1,
  GET_MERKLE_SIBLINGS = 2,
}

export const sendRawToUtxoServer = (opcode: UtxoOpcode, body: Buffer): Promise<Buffer> =>
  new Promise((resolve, reject) => {
    const socket = net.createConnection({ host: UTXO_SERVER_HOST, port: UTXO_SERVER_PORT });
    let buf = Buffer.alloc(0);
    let bodyLen = -1;

    socket.once('connect', () => {
      const payload = Buffer.concat([Buffer.from([opcode]), body]);
      const header = Buffer.allocUnsafe(4);
      header.writeUInt32BE(payload.length, 0);
      socket.write(Buffer.concat([header, payload]));
    });

    socket.on('data', (chunk: Buffer) => {
      buf = Buffer.concat([buf, chunk]);
      try {
        if (bodyLen === -1 && buf.length >= 4) {
          bodyLen = buf.readUInt32BE(0);
          buf = buf.subarray(4);
        }
        if (bodyLen !== -1 && buf.length >= bodyLen) {
          socket.destroy();
          resolve(buf.subarray(0, bodyLen));
        }
      } catch (err) {
        socket.destroy();
        reject(err);
      }
    });

    socket.once('error', (err) => {
      socket.destroy();
      reject(err);
    });
    socket.once('close', () => {
      if (bodyLen === -1 || buf.length < bodyLen)
        reject(new Error('utxo-server closed connection before full response'));
    });
  });

export const sendToUtxoServer = (opcode: UtxoOpcode, chainId: number, ...bodyParts: Buffer[]): Promise<Buffer> => {
  const chainIdBuf = Buffer.allocUnsafe(4);
  chainIdBuf.writeUInt32BE(chainId, 0);
  return sendRawToUtxoServer(opcode, Buffer.concat([chainIdBuf, ...bodyParts]));
};
