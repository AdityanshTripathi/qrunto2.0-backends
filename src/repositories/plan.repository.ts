import { prisma } from '../lib/prisma';
import { SubscriptionPlan } from '@prisma/client';

export class PlanRepository {
  async getActivePlans(): Promise<SubscriptionPlan[]> {
    return prisma.subscriptionPlan.findMany({
      where: { isActive: true },
      orderBy: { price: 'asc' },
    });
  }

  async findPlanById(id: string): Promise<SubscriptionPlan | null> {
    return prisma.subscriptionPlan.findUnique({
      where: { id },
    });
  }
}
