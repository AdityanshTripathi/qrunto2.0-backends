import { PlanRepository } from '../repositories/plan.repository';
import { SubscriptionPlan } from '@prisma/client';

const planRepository = new PlanRepository();

export class PlanService {
  async getActivePlans(): Promise<SubscriptionPlan[]> {
    return planRepository.getActivePlans();
  }
}
