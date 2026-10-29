import { BalanceResponse, getErrorMessage, THROWN_ERROR_MESSAGES } from '@hinkal/common';
import { Request, Response, Router } from 'express';
import { hinkalInitializerService } from '../services/hinkalInitializerService';
import { verifyReadOnlySignatureMiddleware } from '../middleware';

const router = Router();

router.get(
  '/balance',
  verifyReadOnlySignatureMiddleware,
  async (req: Request<object, BalanceResponse>, res: Response<BalanceResponse>) => {
    try {
      const chainIdNum = Number(req.query.chainId);
      const balances = await hinkalInitializerService.withHinkalForAddress(
        res.locals.address,
        chainIdNum,
        async (hinkal) => {
          const balancesByChain = await hinkal.getTotalBalances([chainIdNum], undefined, undefined, false, true);
          const chainBalances = balancesByChain.get(chainIdNum);
          if (!chainBalances)
            throw new Error(`${THROWN_ERROR_MESSAGES.FAILED_TO_FETCH_BALANCES_FOR_CHAINID}: ${chainIdNum}`);
          return chainBalances;
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
  verifyReadOnlySignatureMiddleware,
  async (req: Request<object, BalanceResponse>, res: Response<BalanceResponse>) => {
    try {
      const chainIdNum = Number(req.query.chainId);
      const balances = await hinkalInitializerService.withHinkalForAddress(
        res.locals.address,
        chainIdNum,
        async (hinkal) => {
          const balancesByChain = await hinkal.getTotalBalances([chainIdNum], undefined, undefined, false, true, true);
          const chainBalances = balancesByChain.get(chainIdNum);
          if (!chainBalances)
            throw new Error(`${THROWN_ERROR_MESSAGES.FAILED_TO_FETCH_STUCK_BALANCES_FOR_CHAINID}: ${chainIdNum}`);
          return chainBalances;
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
  '/stuck-bridge-balance',
  verifyReadOnlySignatureMiddleware,
  async (req: Request<object, BalanceResponse>, res: Response<BalanceResponse>) => {
    try {
      const chainIdNum = Number(req.query.chainId);
      const balances = await hinkalInitializerService.withHinkalForAddress(res.locals.address, chainIdNum, (hinkal) =>
        hinkal.getStuckBridgeBalances([chainIdNum]),
      );

      const totals = new Map<string, bigint>();
      balances.forEach(({ token, balance }) =>
        totals.set(token.erc20TokenAddress, (totals.get(token.erc20TokenAddress) ?? 0n) + balance),
      );

      res.status(200).json({
        success: true,
        balances: Array.from(totals, ([tokenAddress, balance]) => ({
          chainId: chainIdNum,
          tokenAddress,
          balance: balance.toString(),
        })),
      });
    } catch (error) {
      res.status(500).json({ success: false, error: getErrorMessage(error) });
    }
  },
);

export default router;
