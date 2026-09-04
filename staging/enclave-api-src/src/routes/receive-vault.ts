import { getErrorMessage, isReceiveVaultSupported, Logger, toJsonSafe } from '@hinkal/common';
import { Request, Response, Router } from 'express';
import { hinkalInitializerService } from '../services/hinkalInitializerService';
import {
  verifyReadOnlySignatureMiddleware,
  verifyReceiveVaultRecoverSignatureMiddleware,
  verifySignatureMiddleware,
} from '../middleware';
import {
  ReceiveAddressRequest,
  ReceiveAddressResponse,
  ReceiveVaultAccountResponse,
  ReceiveVaultRecoverRequest,
  ReceiveVaultRecoverResponse,
} from '../types/route.types';

const router = Router();

router.post(
  '/receive-address',
  verifySignatureMiddleware,
  async (
    req: Request<object, ReceiveAddressResponse, ReceiveAddressRequest>,
    res: Response<ReceiveAddressResponse>,
  ) => {
    try {
      const { chainId, tokenAddress } = req.body;

      if (!isReceiveVaultSupported(chainId)) {
        res.status(400).json({ success: false, error: `Receive addresses are not available on chain ${chainId}` });
        return;
      }

      const record = await hinkalInitializerService.withHinkalForAddress(res.locals.address, chainId, async (hinkal) =>
        hinkal.createReceiveAddress(chainId, tokenAddress),
      );

      res.status(200).json({ success: true, record });
    } catch (error) {
      Logger.error('[/receive-address] error:', error);
      res.status(500).json({ success: false, error: getErrorMessage(error) });
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

      res.status(200).json({
        success: true,
        entries: entries.map(({ record, token, expiresAt }) => ({
          record,
          token,
          expiresAt: expiresAt.toISOString(),
        })),
        blockedFunds: blockedFunds.map(({ record, token, amount, reason }) => ({
          record,
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
  async (
    req: Request<object, ReceiveVaultRecoverResponse, ReceiveVaultRecoverRequest>,
    res: Response<ReceiveVaultRecoverResponse>,
  ) => {
    try {
      const { chainId, vaultAddress, tokenAddress, recipientAddress } = req.body;

      const txData = await hinkalInitializerService.withHinkalForAddress(
        res.locals.address,
        chainId,
        async (hinkal) => {
          const { entries, blockedFunds } = await hinkal.getReceiveVaultAccount();
          const record = [...entries, ...blockedFunds]
            .map(({ record: entryRecord }) => entryRecord)
            .find((entryRecord) => entryRecord.vaultAddress.toLowerCase() === vaultAddress.toLowerCase());
          if (!record) throw new Error(`Receive address ${vaultAddress} does not belong to this account`);

          return hinkal.recoverReceiveVault(record, tokenAddress, chainId, recipientAddress, true);
        },
      );

      res.status(200).json(toJsonSafe({ success: true, txData }) as ReceiveVaultRecoverResponse);
    } catch (error) {
      Logger.error('[/receive-vault-recover] error:', error);
      res.status(500).json({ success: false, error: getErrorMessage(error) });
    }
  },
);

export default router;
