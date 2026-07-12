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
exports.LoyaltyService = void 0;
const prisma_1 = require("../../lib/prisma");
const client_1 = require("@prisma/client");
class LoyaltyService {
    // Get or create loyalty account for customer
    getOrCreateAccount(customerId, tx) {
        return __awaiter(this, void 0, void 0, function* () {
            const client = tx || prisma_1.prisma;
            let account = yield client.loyaltyAccount.findUnique({
                where: { customerId },
            });
            if (!account) {
                account = yield client.loyaltyAccount.create({
                    data: {
                        customerId,
                        pointsBalance: 0,
                        lifetimePoints: 0,
                    },
                });
            }
            return account;
        });
    }
    // Calculate points multiplier based on brand tier qualifications
    determineCustomerTierAndMultiplier(customerId, brandId, tx) {
        return __awaiter(this, void 0, void 0, function* () {
            const client = tx || prisma_1.prisma;
            // 1. Fetch all brand loyalty tiers sorted by minSpend desc
            const tiers = yield client.loyaltyTier.findMany({
                where: { brandId },
                orderBy: { minSpend: 'desc' },
            });
            if (tiers.length === 0) {
                return { tierId: null, multiplier: 1.0 };
            }
            // 2. Sum customer's total spend across all outlets of the Brand
            const profiles = yield client.customerRestaurantProfile.findMany({
                where: { customerId },
            });
            const totalSpend = profiles.reduce((sum, profile) => sum + (profile.totalSpend || 0), 0);
            // 3. Find highest qualifying tier
            const qualifyingTier = tiers.find((tier) => totalSpend >= tier.minSpend);
            if (qualifyingTier) {
                // Update customer profiles to link to this qualified tier
                yield client.customerRestaurantProfile.updateMany({
                    where: { customerId },
                    data: { loyaltyTierId: qualifyingTier.id },
                });
                return { tierId: qualifyingTier.id, multiplier: qualifyingTier.multiplier };
            }
            return { tierId: null, multiplier: 1.0 };
        });
    }
    // Transactional earn points action
    earnPoints(customerId, brandId, amountSpent, orderId, tx) {
        return __awaiter(this, void 0, void 0, function* () {
            const client = tx || prisma_1.prisma;
            // 1. Ensure account exists
            const account = yield this.getOrCreateAccount(customerId, client);
            // 2. Fetch multiplier
            const { multiplier } = yield this.determineCustomerTierAndMultiplier(customerId, brandId, client);
            // 3. Calculate points (e.g. ₹1 = 1 point * multiplier)
            const pointsToEarn = Math.floor(amountSpent * multiplier);
            if (pointsToEarn <= 0)
                return account;
            // 4. Create ledger log
            yield client.loyaltyLedger.create({
                data: {
                    loyaltyAccountId: account.id,
                    points: pointsToEarn,
                    transactionType: client_1.LoyaltyTransactionType.EARN,
                    description: `Earned on order payment (multiplier: ${multiplier}x)`,
                    orderId,
                },
            });
            // 5. Update balances
            return client.loyaltyAccount.update({
                where: { id: account.id },
                data: {
                    pointsBalance: { increment: pointsToEarn },
                    lifetimePoints: { increment: pointsToEarn },
                },
            });
        });
    }
    // Transactional redeem points action
    redeemPoints(customerId, pointsToRedeem, orderId, tx) {
        return __awaiter(this, void 0, void 0, function* () {
            const client = tx || prisma_1.prisma;
            if (pointsToRedeem <= 0) {
                throw new Error('Points to redeem must be greater than zero');
            }
            // 1. Fetch account
            const account = yield this.getOrCreateAccount(customerId, client);
            // 2. Verify balance
            if (account.pointsBalance < pointsToRedeem) {
                throw new Error(`Insufficient points balance. Available: ${account.pointsBalance}, Required: ${pointsToRedeem}`);
            }
            // 3. Log ledger entry
            yield client.loyaltyLedger.create({
                data: {
                    loyaltyAccountId: account.id,
                    points: -pointsToRedeem,
                    transactionType: client_1.LoyaltyTransactionType.REDEMPTION,
                    description: `Redeemed points on checkout`,
                    orderId,
                },
            });
            // 4. Deduct balance
            return client.loyaltyAccount.update({
                where: { id: account.id },
                data: {
                    pointsBalance: { decrement: pointsToRedeem },
                },
            });
        });
    }
    // Refund earned or redeemed points on order cancellations
    refundPointsForOrder(orderId, tx) {
        return __awaiter(this, void 0, void 0, function* () {
            const client = tx || prisma_1.prisma;
            // Find any ledger entries linked to this order
            const ledgers = yield client.loyaltyLedger.findMany({
                where: { orderId },
            });
            if (ledgers.length === 0)
                return;
            for (const entry of ledgers) {
                // Revert the transaction
                if (entry.transactionType === client_1.LoyaltyTransactionType.EARN) {
                    // Revert earn: Deduct points from balance and lifetime
                    yield client.loyaltyLedger.create({
                        data: {
                            loyaltyAccountId: entry.loyaltyAccountId,
                            points: -entry.points,
                            transactionType: client_1.LoyaltyTransactionType.REFUND,
                            description: `Reverted points earned on cancelled order`,
                            orderId,
                        },
                    });
                    yield client.loyaltyAccount.update({
                        where: { id: entry.loyaltyAccountId },
                        data: {
                            pointsBalance: { decrement: entry.points },
                            lifetimePoints: { decrement: entry.points },
                        },
                    });
                }
                else if (entry.transactionType === client_1.LoyaltyTransactionType.REDEMPTION) {
                    // Revert redemption: Add back redeemed points (negative of negative is positive)
                    const pointsToReturn = Math.abs(entry.points);
                    yield client.loyaltyLedger.create({
                        data: {
                            loyaltyAccountId: entry.loyaltyAccountId,
                            points: pointsToReturn,
                            transactionType: client_1.LoyaltyTransactionType.REFUND,
                            description: `Refunded points redeemed on cancelled order`,
                            orderId,
                        },
                    });
                    yield client.loyaltyAccount.update({
                        where: { id: entry.loyaltyAccountId },
                        data: {
                            pointsBalance: { increment: pointsToReturn },
                        },
                    });
                }
            }
        });
    }
    // Manual or system balance adjustment
    adjustPointsBalance(loyaltyAccountId, points, description, tx) {
        return __awaiter(this, void 0, void 0, function* () {
            const client = tx || prisma_1.prisma;
            yield client.loyaltyLedger.create({
                data: {
                    loyaltyAccountId,
                    points,
                    transactionType: points >= 0 ? client_1.LoyaltyTransactionType.MANUAL_ADJUSTMENT : client_1.LoyaltyTransactionType.REDEMPTION,
                    description,
                },
            });
            return client.loyaltyAccount.update({
                where: { id: loyaltyAccountId },
                data: {
                    pointsBalance: { increment: points },
                    lifetimePoints: points > 0 ? { increment: points } : undefined,
                },
            });
        });
    }
}
exports.LoyaltyService = LoyaltyService;
//# sourceMappingURL=loyalty.service.js.map