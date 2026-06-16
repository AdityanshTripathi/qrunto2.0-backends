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
exports.SubscriptionController = void 0;
const zod_1 = require("zod");
const subscription_service_1 = require("../services/subscription.service");
const prisma_1 = require("../lib/prisma");
const subscriptionService = new subscription_service_1.SubscriptionService();
const CreateSubscriptionSchema = zod_1.z.object({
    planId: zod_1.z.string().uuid('Invalid plan ID format'),
});
class SubscriptionController {
    createPendingSubscription(req, res) {
        return __awaiter(this, void 0, void 0, function* () {
            try {
                // 1. Check authentication
                if (!req.user) {
                    res.status(401).json({ error: 'Authentication required' });
                    return;
                }
                const restaurantId = req.user.restaurantId;
                if (!restaurantId) {
                    res.status(400).json({ error: 'No restaurant associated with this user session' });
                    return;
                }
                // 2. Validate input
                const validationResult = CreateSubscriptionSchema.safeParse(req.body);
                if (!validationResult.success) {
                    res.status(400).json({ errors: validationResult.error.flatten().fieldErrors });
                    return;
                }
                // 3. Call service
                const subscription = yield subscriptionService.createPendingSubscription(restaurantId, validationResult.data.planId);
                res.status(201).json({ subscription });
            }
            catch (err) {
                res.status(400).json({ error: err.message });
            }
        });
    }
    getActiveSubscription(req, res) {
        return __awaiter(this, void 0, void 0, function* () {
            try {
                if (!req.user) {
                    res.status(401).json({ error: 'Authentication required' });
                    return;
                }
                const restaurantId = req.user.restaurantId;
                if (!restaurantId) {
                    res.status(400).json({ error: 'No restaurant associated with this user session' });
                    return;
                }
                const subscription = yield subscriptionService.getActiveSubscription(restaurantId);
                res.status(200).json({ subscription });
            }
            catch (err) {
                res.status(400).json({ error: err.message });
            }
        });
    }
    redeemLicenseCode(req, res) {
        return __awaiter(this, void 0, void 0, function* () {
            try {
                if (!req.user) {
                    res.status(401).json({ error: 'Authentication required' });
                    return;
                }
                const restaurantId = req.user.restaurantId;
                if (!restaurantId) {
                    res.status(400).json({ error: 'No restaurant associated with this user session' });
                    return;
                }
                const { code } = req.body;
                if (!code) {
                    res.status(400).json({ error: 'License code is required' });
                    return;
                }
                const cleanCode = code.toUpperCase().trim();
                // Find the code
                const promoCode = yield prisma_1.prisma.promoCode.findUnique({
                    where: { code: cleanCode },
                    include: { plan: true }
                });
                if (!promoCode) {
                    res.status(404).json({ error: 'Invalid license code' });
                    return;
                }
                if (!promoCode.isActive) {
                    res.status(400).json({ error: 'This license code is inactive' });
                    return;
                }
                if (promoCode.expiresAt && new Date(promoCode.expiresAt).getTime() < Date.now()) {
                    res.status(400).json({ error: 'This license code has expired' });
                    return;
                }
                if (promoCode.usageLimit && promoCode.usageCount >= promoCode.usageLimit) {
                    res.status(400).json({ error: 'This license code has reached its usage limit' });
                    return;
                }
                if (!promoCode.planId || !promoCode.plan || !promoCode.durationDays) {
                    res.status(400).json({ error: 'License code is not configured correctly' });
                    return;
                }
                const planName = promoCode.plan.name;
                // Check if restaurant already has an active subscription to extend
                const activeSubscription = yield prisma_1.prisma.subscription.findFirst({
                    where: {
                        restaurantId,
                        status: 'ACTIVE',
                        endDate: { gte: new Date() }
                    }
                });
                const now = new Date();
                let startDate = new Date();
                let endDate = new Date();
                if (activeSubscription && activeSubscription.planId === promoCode.planId) {
                    // Extend existing subscription
                    startDate = new Date(activeSubscription.startDate);
                    endDate = new Date(activeSubscription.endDate);
                    endDate.setDate(endDate.getDate() + promoCode.durationDays);
                }
                else {
                    // Create new subscription
                    endDate.setDate(endDate.getDate() + promoCode.durationDays);
                }
                // Perform transaction
                yield prisma_1.prisma.$transaction((tx) => __awaiter(this, void 0, void 0, function* () {
                    // 1. If switching plans, set previous active subscriptions to CANCELLED
                    if (activeSubscription && activeSubscription.planId !== promoCode.planId) {
                        yield tx.subscription.updateMany({
                            where: { restaurantId, status: 'ACTIVE' },
                            data: { status: 'CANCELLED' }
                        });
                    }
                    // 2. Create or update the subscription
                    if (activeSubscription && activeSubscription.planId === promoCode.planId) {
                        yield tx.subscription.update({
                            where: { id: activeSubscription.id },
                            data: { endDate }
                        });
                    }
                    else {
                        yield tx.subscription.create({
                            data: {
                                restaurantId,
                                planId: promoCode.planId,
                                status: 'ACTIVE',
                                startDate,
                                endDate
                            }
                        });
                    }
                    // 3. Increment code usage count
                    yield tx.promoCode.update({
                        where: { id: promoCode.id },
                        data: {
                            usageCount: { increment: 1 }
                        }
                    });
                    // 4. Create redemption log
                    yield tx.promoRedemption.create({
                        data: {
                            promoCodeId: promoCode.id,
                            restaurantId,
                            subscriptionStart: startDate,
                            subscriptionEnd: endDate
                        }
                    });
                    // 5. Create a billing notification for the restaurant
                    yield tx.notification.create({
                        data: {
                            restaurantId,
                            title: 'Plan Activated Successfully',
                            message: `Your subscription to the ${planName} plan has been activated. Valid until ${endDate.toLocaleDateString('en-IN')}.`,
                            type: 'BILLING'
                        }
                    });
                }));
                res.status(200).json({
                    message: `License code redeemed successfully! Active plan: ${planName}`,
                    planName,
                    expiresAt: endDate
                });
            }
            catch (err) {
                res.status(500).json({ error: err.message });
            }
        });
    }
    purchaseSubscription(req, res) {
        return __awaiter(this, void 0, void 0, function* () {
            try {
                if (!req.user) {
                    res.status(401).json({ error: 'Authentication required' });
                    return;
                }
                const restaurantId = req.user.restaurantId;
                if (!restaurantId) {
                    res.status(400).json({ error: 'No restaurant associated with this user session' });
                    return;
                }
                const { planId, paymentMethod } = req.body;
                if (!planId) {
                    res.status(400).json({ error: 'Plan ID is required' });
                    return;
                }
                // Fetch the plan
                const plan = yield prisma_1.prisma.subscriptionPlan.findUnique({
                    where: { id: planId }
                });
                if (!plan || !plan.isActive) {
                    res.status(404).json({ error: 'Active subscription plan not found' });
                    return;
                }
                // Generate a clean code, e.g. QR-PLAN-XXXXXX
                const rand = Math.random().toString(36).substring(2, 8).toUpperCase();
                const cleanPlanName = plan.name.replace(/\s+/g, '').toUpperCase().substring(0, 4);
                const generatedCode = `QR-${cleanPlanName}-${rand}`;
                // Run database transaction
                const promoCode = yield prisma_1.prisma.$transaction((tx) => __awaiter(this, void 0, void 0, function* () {
                    // 1. Create a successful payment entry
                    yield tx.payment.create({
                        data: {
                            restaurantId,
                            amount: plan.price,
                            status: 'SUCCESS',
                            paymentMethod: paymentMethod || 'ONLINE',
                            paidAt: new Date()
                        }
                    });
                    // 2. Create the license activation code
                    const code = yield tx.promoCode.create({
                        data: {
                            code: generatedCode,
                            type: 'FREE_TRIAL',
                            value: 0,
                            planId: plan.id,
                            durationDays: plan.durationDays,
                            usageLimit: 1,
                            usageCount: 0,
                            isActive: true
                        }
                    });
                    return code;
                }));
                res.status(201).json({
                    message: 'Payment processed and activation code generated successfully!',
                    code: promoCode.code,
                    planName: plan.name
                });
            }
            catch (err) {
                res.status(500).json({ error: err.message });
            }
        });
    }
}
exports.SubscriptionController = SubscriptionController;
//# sourceMappingURL=subscription.controller.js.map