import { SubscriptionRepository } from '../repositories/subscription.repository';
import { PlanRepository } from '../repositories/plan.repository';
import { SubscriptionWithPlan } from '../repositories/subscription.repository';
import { SubscriptionStatus } from '@prisma/client';

const subscriptionRepository = new SubscriptionRepository();
const planRepository = new PlanRepository();

export class SubscriptionService {
  async createPendingSubscription(restaurantId: string, planId: string): Promise<SubscriptionWithPlan> {
    // 1. Fetch plan to validate and get duration
    const plan = await planRepository.findPlanById(planId);
    if (!plan) {
      throw new Error('Subscription plan not found');
    }

    if (!plan.isActive) {
      throw new Error('Selected subscription plan is currently inactive');
    }

    const startDate = new Date();
    const endDate = new Date(startDate.getTime() + plan.durationDays * 24 * 60 * 60 * 1000);

    // 2. Create pending subscription
    return subscriptionRepository.createSubscription({
      restaurantId,
      planId,
      startDate,
      endDate,
      status: SubscriptionStatus.PENDING, // Pending until payment is completed
    });
  }

  async getActiveSubscription(restaurantId: string): Promise<SubscriptionWithPlan | null> {
    return subscriptionRepository.findActiveSubscriptionByRestaurantId(restaurantId);
  }
}
