import { SubscriptionPlan } from '@prisma/client';
export declare class PlanRepository {
    getActivePlans(): Promise<SubscriptionPlan[]>;
    findPlanById(id: string): Promise<SubscriptionPlan | null>;
}
//# sourceMappingURL=plan.repository.d.ts.map