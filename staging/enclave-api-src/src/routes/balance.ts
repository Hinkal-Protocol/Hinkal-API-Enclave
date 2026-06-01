import { Request, Response, Router } from 'express';
import { getErrorMessage } from '@hinkal/common';
import { hinkalInitializerService } from '../services/hinkalInitializerService';
import { BalanceRequest, BalanceResponse, RefreshCacheResponse } from '../types/route.types';
import { verifySignatureMiddleware } from '../middleware';
import { refreshAddressCache } from '../utils/balance.utils';

const router = Router();

router.get(
  '/balance',
  verifySignatureMiddleware,
  async (req: Request<object, BalanceResponse, never, BalanceRequest>, res: Response<BalanceResponse>) => {
    try {
      const { address, chainId } = req.query;
      const chainIdNum = Number(chainId);

      const hinkal = await hinkalInitializerService.initalizeHinkalForAddress(address, chainIdNum);

      const balances = await hinkal.getTotalBalance(chainIdNum, undefined, undefined, false, true);

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
  async (req: Request<object, BalanceResponse, never, BalanceRequest>, res: Response<BalanceResponse>) => {
    try {
      const { address, chainId } = req.query;
      const chainIdNum = Number(chainId);

      const hinkal = await hinkalInitializerService.initalizeHinkalForAddress(address, chainIdNum);

      const balances = await hinkal.getTotalBalance(chainIdNum, undefined, undefined, false, true, true);

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
  async (req: Request<object, RefreshCacheResponse, BalanceRequest>, res: Response<RefreshCacheResponse>) => {
    try {
      const { address, chainId } = req.body;
      const chainIdNum = Number(chainId);

      await refreshAddressCache(address, chainIdNum);

      res.status(200).json({ success: true });
    } catch (error) {
      res.status(500).json({ success: false, error: getErrorMessage(error) });
    }
  },
);

export default router;
