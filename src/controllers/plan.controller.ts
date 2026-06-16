import { Request, Response } from 'express';
import { PlanService } from '../services/plan.service';

const planService = new PlanService();

export class PlanController {
  async getActivePlans(req: Request, res: Response): Promise<void> {
    try {
      const plans = await planService.getActivePlans();
      res.status(200).json({ plans });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  }
}
