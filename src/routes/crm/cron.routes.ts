import { Router } from 'express';
import { timingSafeEqual } from 'node:crypto';
import { CRMScheduler } from '../../services/crm/scheduler.service';
import { logSafeError } from '../../lib/safe-error';

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

export default router;
