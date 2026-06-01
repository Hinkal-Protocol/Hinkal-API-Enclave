import { NextFunction, Request, Response } from 'express';
import { StampNonceModel } from '../models/StampNonceSchema';
import { XStamp } from '../types';
import nacl from 'tweetnacl';

const serializePayloadForSignature = (params: Record<string, unknown>): string => {
  return JSON.stringify(Object.entries(params));
};

const parseXStamp = (xStamp: string): XStamp | null => {
  try {
    const decoded = Buffer.from(xStamp, 'base64url').toString('utf8');
    const parsed = JSON.parse(decoded);
    if (typeof parsed.publicKey !== 'string' || !parsed.publicKey) return null;
    if (typeof parsed.signature !== 'string' || !parsed.signature) return null;
    return { publicKey: parsed.publicKey, signature: parsed.signature };
  } catch {
    return null;
  }
};

/**
 * Verify an Ed25519 stamp signature.
 * The signature is over the UTF-8 bytes of `message`.
 * Both publicKey and signature are hex-encoded strings.
 */
const verifyStamp = (message: string, xStamp: XStamp): boolean => {
  try {
    const { publicKey: signerPublicKey, signature: stampSignature } = xStamp;
    const messageBytes = new TextEncoder().encode(message);
    const signatureBytes = Uint8Array.from(Buffer.from(stampSignature, 'hex'));
    const publicKeyBytes = Uint8Array.from(Buffer.from(signerPublicKey, 'hex'));
    return nacl.sign.detached.verify(messageBytes, signatureBytes, publicKeyBytes);
  } catch {
    return false;
  }
};

export const xStampMiddleware = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const xStamp = req.headers['x-stamp'];
    if (!xStamp || typeof xStamp !== 'string') {
      res.status(400).send({ status: 'error', message: 'Missing required header: X-Stamp' });
      return;
    }

    const parsed = parseXStamp(xStamp);
    if (!parsed) {
      res.status(400).send({ status: 'error', message: 'Invalid X-Stamp' });
      return;
    }

    const params = req.method === 'GET' ? req.query : req.body;
    if (!verifyStamp(serializePayloadForSignature(params), parsed)) {
      res.status(401).send({ status: 'error', message: 'Invalid stamp signature' });
      return;
    }

    const { nonce } = params;
    if (typeof nonce !== 'string' || !nonce) {
      res.status(400).send({ status: 'error', message: 'Missing nonce in request' });
      return;
    }

    try {
      await StampNonceModel.create({ nonce });
    } catch (err: any) {
      if (err?.code === 11000) {
        res.status(401).send({ status: 'error', message: 'Nonce already used' });
        return;
      }
      res.status(500).send({ status: 'error', message: 'Error creating stamp nonce' });
      return;
    }

    res.locals.xStamp = xStamp;
    res.locals.signerPublicKey = parsed.publicKey;
    next();
  } catch (err) {
    res.status(500).send({ status: 'error', message: 'Error validating stamp' });
  }
};
