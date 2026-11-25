import { Request, Response, Router } from 'express';
import { HINKAL_SUPPORTED_CHAINS, isValidAddressForChain } from '@hinkal/common';
import {
  getRequestAttribution,
  partnerKeyMiddleware,
  verifyReadOnlySignatureMiddleware,
  verifyRecoverStuckBalanceSignatureMiddleware,
} from '../middleware';
import {
  RecoverStuckBalanceRequest,
  RecoverStuckBalanceResponse,
  StuckBalanceKind,
  StuckBalancesResponse,
} from '../types';
import { hinkalInitializerService } from '../services/hinkalInitializerService';
import { getStuckBalances, recoverStuckBalance } from '../services/stuckBalances';
import { invalidAddressMessage } from '../utils/queryGuards';
import { rejectNonWhitelistedRef } from '../utils/referralWhitelist';
import { resolveRouteError } from '../utils/routeError';

const router = Router();

const STUCK_BALANCE_KINDS = Object.values(StuckBalanceKind);

const rejectUnsupportedChain = (res: Response, chainId: number, rawChainId: unknown): boolean => {
  if (HINKAL_SUPPORTED_CHAINS.includes(chainId)) return false;
  res.status(400).json({ success: false, error: `Unsupported chainId: ${rawChainId}` });
  return true;
};

router.get(
  '/stuck-balances',
  verifyReadOnlySignatureMiddleware,
  async (req: Request<object, StuckBalancesResponse>, res: Response<StuckBalancesResponse>) => {
    try {
      const chainId = Number(req.query.chainId);
      if (rejectUnsupportedChain(res, chainId, req.query.chainId)) return;

      const balances = await hinkalInitializerService.withHinkalForAddress(res.locals.address, chainId, (hinkal) =>
        getStuckBalances(hinkal, chainId),
      );
      res.status(200).json({ success: true, balances });
    } catch (error) {
      const { status, message } = resolveRouteError(error);
      res.status(status).json({ success: false, error: message });
    }
  },
);

router.post(
  '/recover-stuck-balance',
  verifyRecoverStuckBalanceSignatureMiddleware,
  partnerKeyMiddleware,
  async (
    req: Request<object, RecoverStuckBalanceResponse, RecoverStuckBalanceRequest>,
    res: Response<RecoverStuckBalanceResponse>,
  ) => {
    try {
      const { tokenAddress, recipientAddress, kind, vaultAddress, ref } = req.body;
      const chainId = Number(req.body.chainId);

      if (rejectUnsupportedChain(res, chainId, req.body.chainId)) return;

      // Normal-mode requests skip the auth body parser, so kind must be checked here before it indexes RECOVERIES.
      if (!STUCK_BALANCE_KINDS.includes(kind)) {
        res
          .status(400)
          .json({ success: false, error: `Invalid kind: expected one of ${STUCK_BALANCE_KINDS.join(', ')}` });
        return;
      }
      if (
        kind === StuckBalanceKind.Vault ? typeof vaultAddress !== 'string' || !vaultAddress : vaultAddress !== undefined
      ) {
        res
          .status(400)
          .json({ success: false, error: 'vaultAddress is required for kind vault and only allowed for it' });
        return;
      }

      if (rejectNonWhitelistedRef(res, ref)) return;

      if (!isValidAddressForChain(chainId, recipientAddress)) {
        res.status(400).json({ success: false, error: invalidAddressMessage('recipientAddress', chainId) });
        return;
      }

      const result = await hinkalInitializerService.withHinkalForAddress(res.locals.address, chainId, (hinkal) =>
        recoverStuckBalance(
          {
            hinkal,
            chainId,
            tokenAddress,
            recipientAddress,
            vaultAddress,
            ref,
            attribution: getRequestAttribution(res, ref),
          },
          kind,
        ),
      );

      res.status(200).json({ success: true, ...result });
    } catch (error) {
      const { status, message } = resolveRouteError(error);
      res.status(status).json({ success: false, error: message });
    }
  },
);

export default router;
