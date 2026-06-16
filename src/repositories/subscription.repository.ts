import { prisma } from '../lib/prisma';
import { Subscription, SubscriptionStatus, SubscriptionPlan } from '@prisma/client';

export type SubscriptionWithPlan = Subscription & { plan: SubscriptionPlan };

export class SubscriptionRepository {
  async createSubscription(data: {
    restaurantId: string;
    planId: string;
    startDate: Date;
    endDate: Date;
    status: SubscriptionStatus;
  }): Promise<SubscriptionWithPlan> {
    return prisma.subscription.create({
      data,
      include: {
        plan: true,
      },
    }) as Promise<SubscriptionWithPlan>;
  }

  async findActiveSubscriptionByRestaurantId(restaurantId: string): Promise<SubscriptionWithPlan | null> {
    return prisma.subscription.findFirst({
      where: {
        restaurantId,
        status: { in: [SubscriptionStatus.ACTIVE, SubscriptionStatus.PENDING] },
      },
      include: {
        plan: true,
      },
      orderBy: {
        createdAt: 'desc',
      },
    }) as Promise<SubscriptionWithPlan | null>;
  }
}
