"use strict";
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.SubscriptionService = void 0;
const subscription_repository_1 = require("../repositories/subscription.repository");
const plan_repository_1 = require("../repositories/plan.repository");
const client_1 = require("@prisma/client");
const subscriptionRepository = new subscription_repository_1.SubscriptionRepository();
const planRepository = new plan_repository_1.PlanRepository();
class SubscriptionService {
    createPendingSubscription(restaurantId, planId) {
        return __awaiter(this, void 0, void 0, function* () {
            // 1. Fetch plan to validate and get duration
            const plan = yield planRepository.findPlanById(planId);
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
                status: client_1.SubscriptionStatus.PENDING, // Pending until payment is completed
            });
        });
    }
    getActiveSubscription(restaurantId) {
        return __awaiter(this, void 0, void 0, function* () {
            return subscriptionRepository.findActiveSubscriptionByRestaurantId(restaurantId);
        });
    }
}
exports.SubscriptionService = SubscriptionService;
//# sourceMappingURL=subscription.service.js.map