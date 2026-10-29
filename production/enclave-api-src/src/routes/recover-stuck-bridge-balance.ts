import { Request, Response, Router } from 'express';
import { addressEqual, getErrorMessage, isValidAddressForChain } from '@hinkal/common';
import { verifyRecoverStuckBridgeBalanceSignatureMiddleware } from '../middleware';
import { RecoverStuckBridgeBalanceRequest } from '../types';
import { invalidAddressMessage } from '../utils/queryGuards';
import { hinkalInitializerService } from '../services/hinkalInitializerService';

const router = Router();

router.post(
  '/recover-stuck-bridge-balance',
  verifyRecoverStuckBridgeBalanceSignatureMiddleware,
  async (req: Request<object, unknown, RecoverStuckBridgeBalanceRequest>, res: Response) => {
    try {
      const { tokenAddress, recipientAddress } = req.body;
      const chainId = Number(req.body.chainId);

      if (!isValidAddressForChain(chainId, recipientAddress)) {
        res.status(400).json({ success: false, error: invalidAddressMessage('recipientAddress', chainId) });
        return;
      }

      const { foundCount, recoveredCount, recoveredAmount, errors } =
        await hinkalInitializerService.withHinkalForAddress(res.locals.address, chainId, async (hinkal) => {
          const balances = (await hinkal.getStuckBridgeBalances([chainId])).filter(({ token }) =>
            addressEqual(chainId, token.erc20TokenAddress, tokenAddress),
          );

          const recoveryErrors: string[] = [];
          let amount = 0n;
          await balances.reduce(async (previous, balance) => {
            await previous;
            try {
              await hinkal.recoverStuckBridgeBalance(balance, recipientAddress);
              amount += balance.balance;
            } catch (error) {
              recoveryErrors.push(getErrorMessage(error));
            }
          }, Promise.resolve());

          return {
            foundCount: balances.length,
            recoveredCount: balances.length - recoveryErrors.length,
            recoveredAmount: amount,
            errors: recoveryErrors,
          };
        });

      if (!foundCount) {
        res.status(400).json({ success: false, error: 'No stuck bridge balance found for this token' });
        return;
      }

      if (!recoveredCount) {
        res.status(500).json({ success: false, error: errors[0], errors });
        return;
      }

      res.status(200).json({
        success: true,
        recoveredCount,
        recoveredAmount: recoveredAmount.toString(),
        failedCount: errors.length,
        errors,
      });
    } catch (error) {
      res.status(500).json({ success: false, error: getErrorMessage(error) });
    }
  },
);

export default router;
