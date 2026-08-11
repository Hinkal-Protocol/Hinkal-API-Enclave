import { Request, Response, Router } from 'express';
import { getNearIntentsStatus } from '@hinkal/common/API/callNearIntentsAPI';
import { sendError } from '../../utils/routeError';
import { walletOwnershipMiddleware, xStampMiddleware } from '../../middleware';
import { parseQueryParams } from '../../utils/request.utils';

const router = Router();

router.get(
  '/waas/near-bridge-status',
  xStampMiddleware,
  walletOwnershipMiddleware,
  async (req: Request, res: Response) => {
    const { depositAddress } = parseQueryParams<{
      organizationId: string;
      userId: string;
      walletAddress: string;
      depositAddress: string;
    }>(req);

    if (!depositAddress) {
      res.status(400).send({ status: 'error', message: 'Missing required param: depositAddress' });
      return;
    }

    try {
      const { status, updatedAt, swapDetails } = await getNearIntentsStatus(depositAddress);

      res
        .status(200)
        .send({ status: 'success', data: { depositAddress, bridgeStatus: status, updatedAt, swapDetails } });
    } catch (err) {
      sendError(res, err);
    }
  },
);

export default router;
