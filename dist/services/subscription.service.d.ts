import { SubscriptionWithPlan } from '../repositories/subscription.repository';
export declare class SubscriptionService {
    createPendingSubscription(restaurantId: string, planId: string): Promise<SubscriptionWithPlan>;
    getActiveSubscription(restaurantId: string): Promise<SubscriptionWithPlan | null>;
}
//# sourceMappingURL=subscription.service.d.ts.map