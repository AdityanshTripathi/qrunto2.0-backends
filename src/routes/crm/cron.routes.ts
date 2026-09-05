import { Router } from 'express';
import { timingSafeEqual } from 'node:crypto';
import { CRMScheduler } from '../../services/crm/scheduler.service';
import { logSafeError } from '../../lib/safe-error';
import { DeductionQueueService } from '../../services/inventory/deduction-queue.service';

const router = Router();

router.get('/', async (req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    res.status(503).json({ error: 'Cron unavailable' });
    return;
  }
  const expected = Buffer.from(`Bearer ${secret}`);
  const received = Buffer.from(req.get('authorization') || '');
  if (expected.length !== received.length || !timingSafeEqual(expected, received)) {
    res.status(401).json({ error: 'Unauthorized' });
    return;
  }
  try {
    const status = await CRMScheduler.runCycle();
    res.status(200).json({ status });
  } catch (error) {
    logSafeError('cron.cycle', error);
    res.status(500).json({ error: 'Cron cycle failed' });
  }
});

router.get('/status', async (req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  const secret = process.env.CRON_SECRET;
  if (!secret) return void res.status(503).json({ error: 'Status unavailable' });
  const expected = Buffer.from(`Bearer ${secret}`);
  const received = Buffer.from(req.get('authorization') || '');
  if (expected.length !== received.length || !timingSafeEqual(expected, received)) {
    return void res.status(401).json({ error: 'Unauthorized' });
  }

  try {
    const [crm, inventory] = await Promise.all([
      CRMScheduler.getStatus(), DeductionQueueService.getStatus(),
    ]);
    res.status(200).json({ crm, inventory });
  } catch (error) {
    logSafeError('cron.status', error);
    res.status(503).json({ error: 'Status unavailable' });
  }
});

export default router;
