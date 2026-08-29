import { Express, Router } from 'express';
import { BASE_URL } from '@hinkal/backend-common';
import { signResponseMiddleware } from '../middleware';
import handshake from '../routes/handshake';
import createSession from '../routes/create-session';
import ping from '../routes/ping';
// import palOrder from '../routes/pal/pal-order';
// import palQuote from '../routes/pal/pal-quote';
// import palStatus from '../routes/pal/pal-status';
// import palTokens from '../routes/pal/pal-tokens';
import recipientInfo from '../routes/recipient-info';
import privateBalance from '../routes/balance';
import deposit from '../routes/deposit';
import withdraw from '../routes/withdraw';
import transfer from '../routes/transfer';
import getFeeRoute from '../routes/get-fee';
import swap from '../routes/swap';
import organization from '../routes/waas/waas-organization';
import user from '../routes/waas/waas-user';
import wallet from '../routes/waas/waas-wallet';
import policy from '../routes/waas/waas-policy';
import privateToPrivate from '../routes/waas/waas-private-to-private';
import privateToPublic from '../routes/waas/waas-private-to-public';
import publicToPrivate from '../routes/waas/waas-public-to-private';
import publicToPublic from '../routes/waas/waas-public-to-public';
import waasPrivateSwap from '../routes/waas/waas-private-swap';
import waasWithdrawStuckUtxos from '../routes/waas/withdraw-stuck-utxos';
import waasRecoverTemporaryWallet from '../routes/waas/waas-recover-temporary-wallet';
import waasScheduledTransaction from '../routes/waas/waas-scheduled-transaction';
import walletActions from '../routes/waas/wallet-actions';
import solanaWalletActions from '../routes/waas/waas-solana-wallet-actions';
import tronWalletActions from '../routes/waas/waas-tron-wallet-actions';
import waasBalances from '../routes/waas/waas-balance';
import privateSend from '../routes/private-send';
import withdrawStuckUtxos from '../routes/withdraw-stuck-utxos';
import attestation from '../routes/attestation';
import info from '../routes/info';

export const loadRoutes = (app: Express) => {
  app.use(BASE_URL, ping);
  // app.use(BASE_URL, maintenance); // TEMPORARY

  // Hinkal API routes — all responses signed by the enclave
  const hinkalAPIRouter = Router();
  hinkalAPIRouter.use(signResponseMiddleware);
  hinkalAPIRouter.use(attestation);
  hinkalAPIRouter.use(createSession);
  hinkalAPIRouter.use(handshake);
  hinkalAPIRouter.use(recipientInfo);
  hinkalAPIRouter.use(privateBalance);
  hinkalAPIRouter.use(deposit);
  hinkalAPIRouter.use(privateSend);
  hinkalAPIRouter.use(withdrawStuckUtxos);
  hinkalAPIRouter.use(getFeeRoute);
  hinkalAPIRouter.use(withdraw);
  hinkalAPIRouter.use(transfer);
  hinkalAPIRouter.use(swap);
  hinkalAPIRouter.use(info);
  app.use(BASE_URL, hinkalAPIRouter);

  // PAL routes
  // app.use(BASE_URL, palOrder);
  // app.use(BASE_URL, palQuote);
  // app.use(BASE_URL, palStatus);
  // app.use(BASE_URL, palTokens);

  // WAAS routes
  app.use(BASE_URL, organization);
  app.use(BASE_URL, user);
  app.use(BASE_URL, wallet);
  app.use(BASE_URL, policy);
  app.use(BASE_URL, publicToPublic);
  app.use(BASE_URL, publicToPrivate);
  app.use(BASE_URL, privateToPublic);
  app.use(BASE_URL, privateToPrivate);
  app.use(BASE_URL, waasPrivateSwap);
  app.use(BASE_URL, walletActions);
  app.use(BASE_URL, solanaWalletActions);
  app.use(BASE_URL, tronWalletActions);
  app.use(BASE_URL, waasBalances);
  app.use(BASE_URL, waasWithdrawStuckUtxos);
  app.use(BASE_URL, waasRecoverTemporaryWallet);
  app.use(BASE_URL, waasScheduledTransaction);
};
