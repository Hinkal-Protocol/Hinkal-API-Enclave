import { Request, Response, Router } from 'express';
import { sendError } from '../../utils/routeError';
import { resolveDepositAndWithdrawScheduleStatus } from '../../services/resolveDepositAndWithdrawScheduleStatus';
import { HttpError } from '@hinkal/common';
import { xStampMiddleware } from '../../middleware';

const router = Router();

router.get('/waas/scheduled-transaction/:scheduleId', xStampMiddleware, async (req: Request, res: Response) => {
  const { scheduleId } = req.params as { scheduleId: string };

  if (!scheduleId) {
    res.status(400).send({ status: 'error', message: 'Missing required param: scheduleId' });
    return;
  }

  try {
    const transactions = await resolveDepositAndWithdrawScheduleStatus(scheduleId);
    if (!transactions) throw new HttpError(404, `Scheduled transaction ${scheduleId} not found`);

    res.status(200).send({ status: 'success', data: { scheduleId, transactions } });
  } catch (err) {
    sendError(res, err);
  }
});

export default router;
