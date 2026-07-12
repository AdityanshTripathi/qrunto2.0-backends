import { prisma } from '../../lib/prisma';
import { LoyaltyTransactionType } from '@prisma/client';

export class LoyaltyService {
  // Get or create loyalty account for customer
  async getOrCreateAccount(customerId: string, tx?: any): Promise<any> {
    const client = tx || prisma;
    
    let account = await client.loyaltyAccount.findUnique({
      where: { customerId },
    });

    if (!account) {
      account = await client.loyaltyAccount.create({
        data: {
          customerId,
          pointsBalance: 0,
          lifetimePoints: 0,
        },
      });
    }

    return account;
  }

  // Calculate points multiplier based on brand tier qualifications
  async determineCustomerTierAndMultiplier(
    customerId: string,
    brandId: string,
    tx?: any
  ): Promise<{ tierId: string | null; multiplier: number }> {
    const client = tx || prisma;

    // 1. Fetch all brand loyalty tiers sorted by minSpend desc
    const tiers = await client.loyaltyTier.findMany({
      where: { brandId },
      orderBy: { minSpend: 'desc' },
    });

    if (tiers.length === 0) {
      return { tierId: null, multiplier: 1.0 };
    }

    // 2. Sum customer's total spend across all outlets of the Brand
    const profiles = await client.customerRestaurantProfile.findMany({
      where: { customerId },
    });
    
    const totalSpend = profiles.reduce((sum: number, profile: any) => sum + (profile.totalSpend || 0), 0);

    // 3. Find highest qualifying tier
    const qualifyingTier = tiers.find((tier: any) => totalSpend >= tier.minSpend);

    if (qualifyingTier) {
      // Update customer profiles to link to this qualified tier
      await client.customerRestaurantProfile.updateMany({
        where: { customerId },
        data: { loyaltyTierId: qualifyingTier.id },
      });

      return { tierId: qualifyingTier.id, multiplier: qualifyingTier.multiplier };
    }

    return { tierId: null, multiplier: 1.0 };
  }

  // Transactional earn points action
  async earnPoints(
    customerId: string,
    brandId: string,
    amountSpent: number,
    orderId: string,
    tx?: any
  ): Promise<any> {
    const client = tx || prisma;

    // 1. Ensure account exists
    const account = await this.getOrCreateAccount(customerId, client);

    // 2. Fetch multiplier
    const { multiplier } = await this.determineCustomerTierAndMultiplier(customerId, brandId, client);

    // 3. Calculate points (e.g. ₹1 = 1 point * multiplier)
    const pointsToEarn = Math.floor(amountSpent * multiplier);

    if (pointsToEarn <= 0) return account;

    // 4. Create ledger log
    await client.loyaltyLedger.create({
      data: {
        loyaltyAccountId: account.id,
        points: pointsToEarn,
        transactionType: LoyaltyTransactionType.EARN,
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
  }

  // Transactional redeem points action
  async redeemPoints(
    customerId: string,
    pointsToRedeem: number,
    orderId: string,
    tx?: any
  ): Promise<any> {
    const client = tx || prisma;

    if (pointsToRedeem <= 0) {
      throw new Error('Points to redeem must be greater than zero');
    }

    // 1. Fetch account
    const account = await this.getOrCreateAccount(customerId, client);

    // 2. Verify balance
    if (account.pointsBalance < pointsToRedeem) {
      throw new Error(`Insufficient points balance. Available: ${account.pointsBalance}, Required: ${pointsToRedeem}`);
    }

    // 3. Log ledger entry
    await client.loyaltyLedger.create({
      data: {
        loyaltyAccountId: account.id,
        points: -pointsToRedeem,
        transactionType: LoyaltyTransactionType.REDEMPTION,
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
  }

  // Refund earned or redeemed points on order cancellations
  async refundPointsForOrder(orderId: string, tx?: any): Promise<void> {
    const client = tx || prisma;

    // Find any ledger entries linked to this order
    const ledgers = await client.loyaltyLedger.findMany({
      where: { orderId },
    });

    if (ledgers.length === 0) return;

    for (const entry of ledgers) {
      // Revert the transaction
      if (entry.transactionType === LoyaltyTransactionType.EARN) {
        // Revert earn: Deduct points from balance and lifetime
        await client.loyaltyLedger.create({
          data: {
            loyaltyAccountId: entry.loyaltyAccountId,
            points: -entry.points,
            transactionType: LoyaltyTransactionType.REFUND,
            description: `Reverted points earned on cancelled order`,
            orderId,
          },
        });

        await client.loyaltyAccount.update({
          where: { id: entry.loyaltyAccountId },
          data: {
            pointsBalance: { decrement: entry.points },
            lifetimePoints: { decrement: entry.points },
          },
        });
      } else if (entry.transactionType === LoyaltyTransactionType.REDEMPTION) {
        // Revert redemption: Add back redeemed points (negative of negative is positive)
        const pointsToReturn = Math.abs(entry.points);
        
        await client.loyaltyLedger.create({
          data: {
            loyaltyAccountId: entry.loyaltyAccountId,
            points: pointsToReturn,
            transactionType: LoyaltyTransactionType.REFUND,
            description: `Refunded points redeemed on cancelled order`,
            orderId,
          },
        });

        await client.loyaltyAccount.update({
          where: { id: entry.loyaltyAccountId },
          data: {
            pointsBalance: { increment: pointsToReturn },
          },
        });
      }
    }
  }

  // Manual or system balance adjustment
  async adjustPointsBalance(
    loyaltyAccountId: string,
    points: number,
    description: string,
    tx?: any
  ): Promise<any> {
    const client = tx || prisma;

    await client.loyaltyLedger.create({
      data: {
        loyaltyAccountId,
        points,
        transactionType: points >= 0 ? LoyaltyTransactionType.MANUAL_ADJUSTMENT : LoyaltyTransactionType.REDEMPTION,
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
  }
}
