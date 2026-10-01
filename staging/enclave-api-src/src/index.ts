import {
  getErrorMessage,
  Logger,
  preProcessing,
  setCustomMerkleSiblingsProvider,
  setCustomProofGenerator,
  setCustomUtxoProvider,
  setDataServerServiceKey,
} from '@hinkal/common';
import { applyPaidRpcUrlOverrides, MONGO_CONNECTION_OPTIONS, setServerSettings } from '@hinkal/backend-common';
import cors from 'cors';
import express, { json } from 'express';
import mongoose from 'mongoose';
import { DATA_SERVER_SERVICE_KEY, DEPLOYMENT_MODE, HEADER_ENCLAVE_SIGNATURE, MONGODB_URL, PORT } from './constants';
import { loadRoutes } from './loaders/routeLoader';
import { enclaveDepositListenerService } from './services/EnclaveDepositListenerService';
import { generateProof } from './utils/generateProof';
import { getUtxosFromUtxoServer } from './utils/utxoServerBalance';
import { getMerkleSiblingsFromUtxoServer } from './utils/utxoServerMerkleSiblings';
import { provisionUtxoServerKey } from './utils/provisionUtxoServerKey';
import { receiveVaultRecoveryListenerService } from './services/ReceiveVaultRecoveryListenerService';
import { privateSendVolumeService } from './services/PrivateSendVolumeService';

applyPaidRpcUrlOverrides();

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
app.use(cors({ exposedHeaders: [HEADER_ENCLAVE_SIGNATURE] }));
app.use(express.text({ type: '*/*', limit: '50mb' }));

loadRoutes(app);

if (DEPLOYMENT_MODE !== 'development') {
  setCustomProofGenerator(generateProof);
  setCustomUtxoProvider(getUtxosFromUtxoServer);
  setCustomMerkleSiblingsProvider(getMerkleSiblingsFromUtxoServer);
  provisionUtxoServerKey().catch((err) => Logger.error('provisionUtxoServerKey failed :', getErrorMessage(err), err));
}

const startServer = async () => {
  try {
    await preProcessing();

    if (!DATA_SERVER_SERVICE_KEY) {
      Logger.error('DATA_SERVER_SERVICE_KEY is not set; data-server will reject emits from this service');
    }
    setDataServerServiceKey(DATA_SERVER_SERVICE_KEY);
    mongoose.set('strictQuery', true);
    mongoose.set('sanitizeFilter', true);
    await mongoose.connect(MONGODB_URL, MONGO_CONNECTION_OPTIONS);
    await enclaveDepositListenerService.init();
    await receiveVaultRecoveryListenerService.init();
    privateSendVolumeService.init();
    const server = app.listen(PORT, () => {
      Logger.log('DEPLOYMENT_MODE:', process.env.DEPLOYMENT_MODE);
      Logger.log('enclave-api service running on port:', PORT);
    });
    setServerSettings(server);
  } catch (err) {
    Logger.error('enclave-api service failed to start:', getErrorMessage(err), err);
  }
};

startServer().catch((err) => Logger.error('enclave-api unhandled startup error:', getErrorMessage(err), err));
