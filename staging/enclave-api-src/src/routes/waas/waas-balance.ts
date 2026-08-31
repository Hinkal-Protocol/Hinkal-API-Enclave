import { walletOwnershipMiddleware, xStampMiddleware } from '../../middleware';
import { parseQueryParams } from '../../utils/request.utils';
import { parseChainId } from '../../utils/transactionHelpers';
import { fetchPrivateBalances, fetchPublicBalances, refreshUserCache } from '../../utils/balance.utils';
import { Logger } from '@hinkal/common';
import { Request, Response, Router } from 'express';

const router = Router();

router.get('/waas/public-balance', async (req: Request, res: Response) => {
  const { walletAddress, chainId } = parseQueryParams<{ walletAddress: string; chainId: string }>(req);

  try {
    const data = await fetchPublicBalances(walletAddress, parseChainId(chainId));
    res.send({ status: 'success', data });
  } catch (err: unknown) {
    const errorMessage = err instanceof Error ? err.message : 'Unknown error';
    Logger.error('Error fetching public balances:', err);
    res.status(500).send({ status: 'error', message: 'public balance fetch failed', error: errorMessage });
  }
});

router.get(
  '/waas/private-balance',
  xStampMiddleware,
  walletOwnershipMiddleware,
  async (req: Request, res: Response) => {
    const { organizationId, userId, walletAddress, chainId } = parseQueryParams<{
      organizationId: string;
      userId: string;
      walletAddress: string;
      chainId: string;
    }>(req);

    try {
      const signerPublicKey = res.locals.signerPublicKey as string;
      const data = await fetchPrivateBalances(
        organizationId,
        userId,
        signerPublicKey,
        walletAddress,
        parseChainId(chainId),
        false,
      );
      res.send({ status: 'success', data });
    } catch (err: unknown) {
      const errorMessage = err instanceof Error ? err.message : 'Unknown error';
      Logger.error('Error fetching private balances:', err);
      res.status(500).send({ status: 'error', message: 'private balance fetch failed', error: errorMessage });
    }
  },
);

router.get('/waas/refresh-cache', xStampMiddleware, walletOwnershipMiddleware, async (req: Request, res: Response) => {
  const { organizationId, userId, walletAddress } = parseQueryParams<{
    organizationId: string;
    userId: string;
    walletAddress: string;
  }>(req);

  try {
    const signerPublicKey = res.locals.signerPublicKey as string;
    await refreshUserCache(organizationId, userId, signerPublicKey, walletAddress);
    res.send({ status: 'success' });
  } catch (err: unknown) {
    const errorMessage = err instanceof Error ? err.message : 'Unknown error';
    Logger.error('Error refreshing user cache:', err);
    res.status(500).send({ status: 'error', message: 'cache refresh failed', error: errorMessage });
  }
});

router.get(
  '/waas/stuck-utxo-balance',
  xStampMiddleware,
  walletOwnershipMiddleware,
  async (req: Request, res: Response) => {
    const { organizationId, userId, walletAddress } = parseQueryParams<{
      organizationId: string;
      userId: string;
      walletAddress: string;
    }>(req);

    try {
      const signerPublicKey = res.locals.signerPublicKey as string;
      const data = await fetchPrivateBalances(organizationId, userId, signerPublicKey, walletAddress, undefined, true);
      res.send({ status: 'success', data });
    } catch (err: unknown) {
      const errorMessage = err instanceof Error ? err.message : 'Unknown error';
      Logger.error('Error fetching stuck UTXO balances:', err);
      res.status(500).send({ status: 'error', message: 'stuck UTXO balance fetch failed', error: errorMessage });
    }
  },
);

export default router;
