import { Request, Response, Router } from 'express';
import { sendError } from '../../utils/routeError';
import {
  API_ERROR_MESSAGES,
  currentTronChainId,
  getScheduledTransactionById,
  hashEthereumAddress,
  HttpError,
  Logger,
  toBase58IfTron,
} from '@hinkal/common';
import { normalizeTronAddr } from '@hinkal/common/functions/utils/tron.utils';
import { walletOwnershipMiddleware, xStampMiddleware } from '../../middleware';
import { parseQueryParams } from '../../utils/request.utils';

const router = Router();

router.get(
  '/waas/scheduled-transaction/:scheduleId',
  xStampMiddleware,
  walletOwnershipMiddleware,
  async (req: Request, res: Response) => {
    const { scheduleId } = req.params as { scheduleId: string };
    const { walletAddress } = parseQueryParams<{
      organizationId: string;
      userId: string;
      walletAddress: string;
    }>(req);

    if (!scheduleId) {
      res.status(400).send({ status: 'error', message: 'Missing required param: scheduleId' });
      return;
    }

    try {
      const scheduled = await getScheduledTransactionById(scheduleId).catch((err) => {
        Logger.error(`[waas/scheduled-transaction] failed for scheduleId ${scheduleId}`, err);
        return null;
      });

      const isOwner =
        scheduled?.hashedEthereumAddress ===
        hashEthereumAddress(normalizeTronAddr(toBase58IfTron(currentTronChainId, walletAddress)));
      if (!scheduled || !isOwner)
        throw new HttpError(404, `${API_ERROR_MESSAGES.SCHEDULED_TX_NOT_FOUND}: ${scheduleId}`);

      res.status(200).send({ status: 'success', data: { scheduleId, transactions: scheduled.transactions } });
    } catch (err) {
      sendError(res, err);
    }
  },
);

export default router;
