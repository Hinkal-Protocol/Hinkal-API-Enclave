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
    // Chunks accumulate here instead of via repeated Buffer.concat, to avoid recopying
    // everything received so far on every single TCP chunk.
    const chunks: Buffer[] = [];
    let received = 0;
    let bodyLen = -1;

    socket.once('connect', () => {
      const payload = Buffer.concat([Buffer.from([opcode]), body]);
      const header = Buffer.allocUnsafe(4);
      header.writeUInt32BE(payload.length, 0);
      socket.write(Buffer.concat([header, payload]));
    });

    socket.on('data', (chunk: Buffer) => {
      chunks.push(chunk);
      received += chunk.length;
      try {
        if (bodyLen === -1 && received >= 4) {
          if (chunks.length === 1) {
            bodyLen = chunks[0].readUInt32BE(0);
            chunks[0] = chunks[0].subarray(4);
            received -= 4;
          } else {
            const merged = Buffer.concat(chunks, received);
            bodyLen = merged.readUInt32BE(0);
            chunks.length = 0;
            chunks.push(merged.subarray(4));
            received = merged.length - 4;
          }
        }
        if (bodyLen !== -1 && received >= bodyLen) {
          socket.destroy();
          const full = chunks.length === 1 ? chunks[0] : Buffer.concat(chunks, received);
          resolve(full.subarray(0, bodyLen));
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
      if (bodyLen === -1 || received < bodyLen) reject(new Error('utxo-server closed connection before full response'));
    });
  });

export const sendToUtxoServer = (opcode: UtxoOpcode, chainId: number, ...bodyParts: Buffer[]): Promise<Buffer> => {
  const chainIdBuf = Buffer.allocUnsafe(4);
  chainIdBuf.writeUInt32BE(chainId, 0);
  return sendRawToUtxoServer(opcode, Buffer.concat([chainIdBuf, ...bodyParts]));
};
