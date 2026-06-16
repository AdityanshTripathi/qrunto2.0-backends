import { Subscription, SubscriptionStatus, SubscriptionPlan } from '@prisma/client';
export type SubscriptionWithPlan = Subscription & {
    plan: SubscriptionPlan;
};
export declare class SubscriptionRepository {
    createSubscription(data: {
        restaurantId: string;
        planId: string;
        startDate: Date;
        endDate: Date;
        status: SubscriptionStatus;
    }): Promise<SubscriptionWithPlan>;
    findActiveSubscriptionByRestaurantId(restaurantId: string): Promise<SubscriptionWithPlan | null>;
}
//# sourceMappingURL=subscription.repository.d.ts.map