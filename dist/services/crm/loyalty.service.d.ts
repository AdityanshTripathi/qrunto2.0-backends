export declare class LoyaltyService {
    getOrCreateAccount(customerId: string, tx?: any): Promise<any>;
    determineCustomerTierAndMultiplier(customerId: string, brandId: string, tx?: any): Promise<{
        tierId: string | null;
        multiplier: number;
    }>;
    earnPoints(customerId: string, brandId: string, amountSpent: number, orderId: string, tx?: any): Promise<any>;
    redeemPoints(customerId: string, pointsToRedeem: number, orderId: string, tx?: any): Promise<any>;
    refundPointsForOrder(orderId: string, tx?: any): Promise<void>;
    adjustPointsBalance(loyaltyAccountId: string, points: number, description: string, tx?: any): Promise<any>;
}
//# sourceMappingURL=loyalty.service.d.ts.map