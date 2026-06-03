import { Express } from 'express';
import { BASE_URL } from '@hinkal/backend-common';
import handshake from '../routes/handshake';
import createSession from '../routes/create-session';
import ping from '../routes/ping';
import palOrder from '../routes/pal/pal-order';
import palQuote from '../routes/pal/pal-quote';
import palStatus from '../routes/pal/pal-status';
import palTokens from '../routes/pal/pal-tokens';
import recipientInfo from '../routes/recipient-info';
import privateBalance from '../routes/balance';
import deposit from '../routes/deposit';
import withdraw from '../routes/withdraw';
import transfer from '../routes/transfer';
import getFeeStructureRoute from '../routes/get-fee-structure';
import swap from '../routes/swap';
import organization from '../routes/waas/waas-organization';
import user from '../routes/waas/waas-user';
import wallet from '../routes/waas/waas-wallet';
import policy from '../routes/waas/waas-policy';
import privateToPrivate from '../routes/waas/waas-private-to-private';
import privateToPublic from '../routes/waas/waas-private-to-public';
import publicToPrivate from '../routes/waas/waas-public-to-private';
import publicToPublic from '../routes/waas/waas-public-to-public';
import waasWithdrawStuckUtxos from '../routes/waas/withdraw-stuck-utxos';
import walletActions from '../routes/waas/wallet-actions';
import solanaWalletActions from '../routes/waas/waas-solana-wallet-actions';
import tronWalletActions from '../routes/waas/waas-tron-wallet-actions';
import waasBalances from '../routes/waas/waas-balance';
import privateSend from '../routes/private-send';
import withdrawStuckUtxos from '../routes/withdraw-stuck-utxos';
import attestation from '../routes/attestation';

export const loadRoutes = (app: Express) => {
  app.use(BASE_URL, ping);
  app.use(BASE_URL, handshake);
  app.use(BASE_URL, attestation);
  app.use(BASE_URL, createSession);

  // Enclave backend routes
  app.use(BASE_URL, recipientInfo);
  app.use(BASE_URL, privateBalance);
  app.use(BASE_URL, deposit);
  app.use(BASE_URL, privateSend);
  app.use(BASE_URL, withdrawStuckUtxos);
  app.use(BASE_URL, getFeeStructureRoute);
  app.use(BASE_URL, withdraw);
  app.use(BASE_URL, transfer);
  app.use(BASE_URL, swap);

  // PAL routes
  app.use(BASE_URL, palOrder);
  app.use(BASE_URL, palQuote);
  app.use(BASE_URL, palStatus);
  app.use(BASE_URL, palTokens);

  // WAAS routes
  app.use(BASE_URL, organization);
  app.use(BASE_URL, user);
  app.use(BASE_URL, wallet);
  app.use(BASE_URL, policy);
  app.use(BASE_URL, publicToPublic);
  app.use(BASE_URL, publicToPrivate);
  app.use(BASE_URL, privateToPublic);
  app.use(BASE_URL, privateToPrivate);
  app.use(BASE_URL, walletActions);
  app.use(BASE_URL, solanaWalletActions);
  app.use(BASE_URL, tronWalletActions);
  app.use(BASE_URL, waasBalances);
  app.use(BASE_URL, waasWithdrawStuckUtxos);
};
