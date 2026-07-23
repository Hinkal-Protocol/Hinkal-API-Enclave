import { BalanceResponse, getErrorMessage, RefreshCacheResponse } from '@hinkal/common';
import { Request, Response, Router } from 'express';
import { hinkalInitializerService } from '../services/hinkalInitializerService';
import { verifySignatureMiddleware } from '../middleware';
import { refreshAddressCache } from '../utils/balance.utils';

const router = Router();

router.get(
  '/balance',
  verifySignatureMiddleware,
  async (req: Request<object, BalanceResponse>, res: Response<BalanceResponse>) => {
    try {
      const chainIdNum = Number(req.query.chainId);
      const balances = await hinkalInitializerService.withHinkalForAddress(
        res.locals.address,
        chainIdNum,
        async (hinkal) => {
          return hinkal.getTotalBalance(chainIdNum, undefined, undefined, false, true);
        },
      );

      res.status(200).json({
        success: true,
        balances: balances.map(({ token, balance }) => ({
          chainId: token.chainId,
          tokenAddress: token.erc20TokenAddress,
          balance: balance.toString(),
        })),
      });
    } catch (error) {
      res.status(500).json({ success: false, error: getErrorMessage(error) });
    }
  },
);

router.get(
  '/stuck-utxo-balance',
  verifySignatureMiddleware,
  async (req: Request<object, BalanceResponse>, res: Response<BalanceResponse>) => {
    try {
      const chainIdNum = Number(req.query.chainId);
      const balances = await hinkalInitializerService.withHinkalForAddress(
        res.locals.address,
        chainIdNum,
        async (hinkal) => {
          return hinkal.getTotalBalance(chainIdNum, undefined, undefined, false, true, true);
        },
      );

      res.status(200).json({
        success: true,
        balances: balances.map(({ token, balance }) => ({
          chainId: token.chainId,
          tokenAddress: token.erc20TokenAddress,
          balance: balance.toString(),
        })),
      });
    } catch (error) {
      res.status(500).json({ success: false, error: getErrorMessage(error) });
    }
  },
);

router.post(
  '/refresh-cache',
  verifySignatureMiddleware,
  async (req: Request<object, RefreshCacheResponse>, res: Response<RefreshCacheResponse>) => {
    try {
      const chainIdNum = Number(req.body.chainId);
      await refreshAddressCache(res.locals.address, chainIdNum);

      res.status(200).json({ success: true });
    } catch (error) {
      res.status(500).json({ success: false, error: getErrorMessage(error) });
    }
  },
);

export default router;
