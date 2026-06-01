import { Request, Response, Router } from 'express';
import { enclaveDepositDispatcherService } from '../../services/EnclaveWithdrawDispatcherService';
import { resolveDepositAndWithdrawScheduleStatus } from '../../services/resolveDepositAndWithdrawScheduleStatus';
import { resolveDepositAndWithdrawPublicStatus } from '../../utils/resolveDepositAndWithdrawPublicStatus';
import { sendError } from '../../utils/routeError';
import { palApiKeyMiddleware } from '../../middleware/palApiKeyMiddleware';

const router = Router();

router.get('/pal/status/:trackingId', palApiKeyMiddleware, async (req: Request, res: Response) => {
  try {
    const order = await enclaveDepositDispatcherService.getOrder(String(req.params.trackingId));
    if (!order) {
      res.status(404).send({ status: 'error', message: 'Order not found' });
      return;
    }
    const scheduledTransactions = order.scheduleId
      ? await resolveDepositAndWithdrawScheduleStatus(order.scheduleId)
      : null;

    res.status(200).send({
      status: 'success',
      data: {
        status: resolveDepositAndWithdrawPublicStatus(order.status),
        ...(scheduledTransactions && { scheduledTransactions }),
      },
    });
  } catch (err) {
    sendError(res, err);
  }
});

export default router;
