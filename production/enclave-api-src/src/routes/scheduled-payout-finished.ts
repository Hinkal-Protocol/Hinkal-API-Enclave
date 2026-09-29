import { Request, Response, Router } from 'express';
import { SCHEDULE_ID_PATTERN } from '../constants';
import { privateSendVolumeService } from '../services/PrivateSendVolumeService';

const router = Router();

router.post('/internal/scheduled-payout-finished', async (req: Request, res: Response) => {
  const { scheduleId } = (req.body ?? {}) as { scheduleId?: unknown };

  if (typeof scheduleId !== 'string' || !SCHEDULE_ID_PATTERN.test(scheduleId)) {
    res.status(400).json({ success: false, error: 'Invalid scheduleId' });
    return;
  }

  await privateSendVolumeService.syncSchedule(scheduleId);
  res.status(200).json({ success: true });
});

export default router;
