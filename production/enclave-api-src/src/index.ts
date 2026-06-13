import {
  getErrorMessage,
  Logger,
  preProcessing,
  setCustomProofGenerator,
  setCustomUtxoDecryptor,
} from '@hinkal/common';
import { liveChainStateService, MONGO_CONNECTION_OPTIONS, setServerSettings } from '@hinkal/backend-common';
import cors from 'cors';
import express, { json } from 'express';
import mongoose from 'mongoose';
import { DB_URI_ENCRYPTED, DEPLOYMENT_MODE, PORT } from './constants';
import { cryptoHelper } from './crypto';
import { loadRoutes } from './loaders/routeLoader';
import { enclaveDepositListenerService } from './services/EnclaveDepositListenerService';
import { generateProof } from './utils/generateProof';
import { decryptUtxosDirect } from './utils/decryptUtxosDirect';

const app = express();

app.use(
  json({
    limit: '10mb',
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    verify: (req: any, _res, buf) => {
      req.rawBody = buf.toString('utf8');
    },
  }),
);
app.use(cors({ exposedHeaders: ['X-Hinkal-Signature'] }));
app.use(express.text({ type: '*/*', limit: '50mb' }));

loadRoutes(app);

if (DEPLOYMENT_MODE !== 'development') {
  setCustomProofGenerator(generateProof);
  setCustomUtxoDecryptor(decryptUtxosDirect);
}

const resolveDbUri = async (): Promise<string> => {
  const decrypted = await cryptoHelper.decrypt(Buffer.from(DB_URI_ENCRYPTED, 'base64'));
  return decrypted.toString('utf8');
};

const startServer = async () => {
  try {
    await preProcessing();
    const dbUri = await resolveDbUri();
    mongoose.set('strictQuery', true);
    await mongoose.connect(dbUri, MONGO_CONNECTION_OPTIONS);
    await liveChainStateService.warmup();
    await enclaveDepositListenerService.init();
    const server = app.listen(PORT, () => {
      Logger.log('DEPLOYMENT_MODE:', process.env.DEPLOYMENT_MODE);
      Logger.log('enclave-api service running on port:', PORT);
    });
    setServerSettings(server);
  } catch (err) {
    Logger.error('enclave-api failed to start:', getErrorMessage(err), err);
  }
};

startServer().catch((err) => Logger.error('enclave-api unhandled startup error:', getErrorMessage(err), err));
