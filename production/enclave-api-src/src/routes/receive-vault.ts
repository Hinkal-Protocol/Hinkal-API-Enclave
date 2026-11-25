import {
  ENCLAVE_TRANSACT_VARIABLE_RATE,
  getErrorMessage,
  isReceiveVaultSupported,
  isValidAddressForChain,
  Logger,
  toJsonSafe,
} from '@hinkal/common';
import { Request, Response, Router } from 'express';
import { hinkalInitializerService } from '../services/hinkalInitializerService';
import {
  getRequestAttribution,
  partnerKeyMiddleware,
  verifyReadOnlySignatureMiddleware,
  verifyReceiveAddressSignatureMiddleware,
  verifyReceiveVaultRecoverSignatureMiddleware,
} from '../middleware';
import { rejectNonWhitelistedRef, resolveRefVariableRate } from '../utils/referralWhitelist';
import { invalidAddressMessage } from '../utils/queryGuards';
import { resolveRouteError } from '../utils/routeError';
import {
  createReceiveAddress,
  createTransferAddress,
  decryptTransferTerms,
  isTransferAddressRequest,
} from '../services/receiveVaultBinding';
import { recoverVault } from '../services/stuckBalances';
import {
  ReceiveAddressRequest,
  ReceiveAddressResponse,
  ReceiveVaultAccountResponse,
  ReceiveVaultRecoverRequest,
  ReceiveVaultRecoverResponse,
} from '../types';

const router = Router();

router.post(
  '/receive-address',
  verifyReceiveAddressSignatureMiddleware,
  partnerKeyMiddleware,
  async (
    req: Request<object, ReceiveAddressResponse, ReceiveAddressRequest>,
    res: Response<ReceiveAddressResponse>,
  ) => {
    try {
      const { chainId, ref } = req.body;

      if (!isReceiveVaultSupported(chainId)) {
        res.status(400).json({ success: false, error: `Receive addresses are not available on chain ${chainId}` });
        return;
      }

      // Accepts a whitelisted ref (tracked) or a rate code (only lowers the fee, not tracked); a plain address
      // then rejects rate codes, since it has no fee. Priced now: a transfer address pays out later, with no
      // request to read the partner key from.
      const resolvedRef = resolveRefVariableRate(res, ref, ENCLAVE_TRANSACT_VARIABLE_RATE);
      if (!resolvedRef) return;
      const { trackedRef, variableRate } = resolvedRef;

      const record = isTransferAddressRequest(req.body)
        ? await createTransferAddress(
            res.locals.address,
            req.body,
            variableRate,
            getRequestAttribution(res, trackedRef),
            trackedRef,
          )
        : await createReceiveAddress(res.locals.address, req.body, trackedRef);

      res.status(200).json({ success: true, record });
    } catch (error) {
      Logger.error('[/receive-address] error:', error);
      const { status, message } = resolveRouteError(error);
      res.status(status).json({ success: false, error: message });
    }
  },
);

router.get(
  '/receive-vault-account',
  verifyReadOnlySignatureMiddleware,
  async (req: Request<object, ReceiveVaultAccountResponse>, res: Response<ReceiveVaultAccountResponse>) => {
    try {
      const chainId = Number(req.query.chainId);

      const { entries, blockedFunds } = await hinkalInitializerService.withHinkalForAddress(
        res.locals.address,
        chainId,
        async (hinkal) => hinkal.getReceiveVaultAccount(),
      );

      // Both lists carry the same records, so a transfer address's terms are decrypted in each.
      const [decryptedEntries, blockedRecords] = await Promise.all([
        decryptTransferTerms(entries),
        decryptTransferTerms(blockedFunds.map(({ record }) => record)),
      ]);

      res.status(200).json({
        success: true,
        entries: decryptedEntries,
        blockedFunds: blockedFunds.map(({ token, amount, reason }, index) => ({
          record: blockedRecords[index],
          token,
          amount: amount.toString(),
          reason,
        })),
      });
    } catch (error) {
      Logger.error('[/receive-vault-account] error:', error);
      res.status(500).json({ success: false, error: getErrorMessage(error) });
    }
  },
);

// The vault owner is a key derived inside the enclave, so only this signs the recovery. Broadcasting
// is the caller's: the session wallet here is void, and the gas is theirs to pay.
router.post(
  '/receive-vault-recover',
  verifyReceiveVaultRecoverSignatureMiddleware,
  partnerKeyMiddleware,
  async (
    req: Request<object, ReceiveVaultRecoverResponse, ReceiveVaultRecoverRequest>,
    res: Response<ReceiveVaultRecoverResponse>,
  ) => {
    try {
      const { chainId, vaultAddress, tokenAddress, recipientAddress, ref } = req.body;

      if (rejectNonWhitelistedRef(res, ref)) return;

      if (!isValidAddressForChain(chainId, recipientAddress)) {
        res.status(400).json({ success: false, error: invalidAddressMessage('recipientAddress', chainId) });
        return;
      }

      const txData = await hinkalInitializerService.withHinkalForAddress(res.locals.address, chainId, (hinkal) =>
        recoverVault(hinkal, getRequestAttribution(res, ref), chainId, vaultAddress, tokenAddress, recipientAddress),
      );

      res.status(200).json(toJsonSafe({ success: true, txData }) as ReceiveVaultRecoverResponse);
    } catch (error) {
      Logger.error('[/receive-vault-recover] error:', error);
      res.status(500).json({ success: false, error: getErrorMessage(error) });
    }
  },
);

export default router;
