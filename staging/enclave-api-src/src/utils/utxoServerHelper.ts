import net from 'net';

const HOST = '127.0.0.1';
const PORT = 7000;

export enum UtxoOpcode {
  DECRYPT_BALANCE = 0,
  GET_BALANCE = 1,
}

export const sendToUtxoServer = (
  chainId: number,
  decryptedInput: Buffer,
  opcode: UtxoOpcode = UtxoOpcode.DECRYPT_BALANCE,
): Promise<Buffer> =>
  new Promise((resolve, reject) => {
    const socket = net.createConnection({ host: HOST, port: PORT });
    let buf = Buffer.alloc(0);
    let bodyLen = -1;

    socket.once('connect', () => {
      const chainIdBuf = Buffer.allocUnsafe(4);
      chainIdBuf.writeUInt32BE(chainId, 0);
      const payload = Buffer.concat([Buffer.from([opcode]), chainIdBuf, decryptedInput]);
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
