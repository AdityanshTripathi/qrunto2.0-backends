import { restaurantTimezone, dateInput, daysAgo, BusinessDateError } from '../../lib/timezone';
import { Request, Response } from 'express';
import { z } from 'zod';
import { ReportService } from '../../services/inventory/report.service';

const reportService = new ReportService();

const ConsumptionAnalyticsSchema = z.object({
  startDate: z.string().optional(),
  endDate: z.string().optional(),
});

export class ReportController {
  async getDashboardMetrics(req: Request, res: Response): Promise<void> {
    try {
      if (!req.user) {
        res.status(401).json({ error: 'Authentication required' });
        return;
      }

      const restaurantId = req.user.restaurantId;
      if (!restaurantId) {
        res.status(400).json({ error: 'No restaurant associated with this session' });
        return;
      }

      const metrics = await reportService.getDashboardMetrics(restaurantId);
      res.status(200).json({ metrics });
    } catch (err: any) {
      res.status(500).json({ error: 'Internal server error' });
    }
  }

  async getConsumptionAnalytics(req: Request, res: Response): Promise<void> {
    try {
      if (!req.user) {
        res.status(401).json({ error: 'Authentication required' });
        return;
      }

      const restaurantId = req.user.restaurantId;
      if (!restaurantId) {
        res.status(400).json({ error: 'No restaurant associated with this session' });
        return;
      }

      const validationResult = ConsumptionAnalyticsSchema.safeParse(req.query);
      if (!validationResult.success) {
        res.status(400).json({ errors: validationResult.error.flatten().fieldErrors });
        return;
      }

      const zone = await restaurantTimezone(restaurantId);
      const endDate = validationResult.data.endDate 
        ? dateInput(validationResult.data.endDate, zone, true)
        : new Date();

      const startDate = validationResult.data.startDate 
        ? dateInput(validationResult.data.startDate, zone)
        : daysAgo(7, zone); // 7 days ago

      const analytics = await reportService.getConsumptionAnalytics(restaurantId, startDate, endDate);
      res.status(200).json({ analytics });
    } catch (err: any) {
      if (err instanceof BusinessDateError) { res.status(400).json({ error: err.message }); return; }
      res.status(500).json({ error: 'Internal server error' });
    }
  }
}
