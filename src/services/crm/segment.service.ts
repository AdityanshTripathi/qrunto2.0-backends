import { daysAgo, timezone } from '../../lib/timezone';
import { prisma } from '../../lib/prisma';
import { logSafeError } from '../../lib/safe-error';

export interface SegmentCriteria {
  minSpend?: number | undefined;
  minOrders?: number | undefined;
  lastVisitDaysAgo?: number | undefined;
  visitedWithinDays?: number | undefined;
  dietary?: string | undefined;
  seating?: string | undefined;
}

export class SegmentService {
  // Create a new segment definition
  async createSegment(
    brandId: string,
    name: string,
    description: string | null,
    criteria: SegmentCriteria
  ): Promise<any> {
    const existing = await prisma.segment.findFirst({
      where: { brandId, crmGeneration: 2, name: { equals: name, mode: 'insensitive' } },
    });

    if (existing) {
      throw new Error(`A segment with the name "${name}" already exists`);
    }

    const segment = await prisma.segment.create({
      data: {
        brandId,
        crmGeneration: 2,
        name,
        description,
        criteriaJson: criteria as any,
      },
    });

    // Run initial evaluation
    await this.evaluateSegment(segment.id, brandId);
    return segment;
  }

  // Get segments list for a brand with membership sizes
  async getSegments(brandId: string): Promise<any[]> {
    return prisma.segment.findMany({
      where: { brandId, crmGeneration: 2 },
      include: {
        _count: {
          select: { customers: true },
        },
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  // Delete segment template
  async deleteSegment(brandId: string, segmentId: string): Promise<void> {
    const segment = await prisma.segment.findFirst({
      where: { id: segmentId, brandId, crmGeneration: 2 },
    });

    if (!segment) {
      throw new Error('Segment not found or unauthorized');
    }

    await prisma.segment.delete({
      where: { id: segmentId },
    });
  }

  // Evaluate segment rules, query matching customers, and sync memberships
  async evaluateSegment(segmentId: string, brandId: string): Promise<number> {
    const segment = await prisma.segment.findUnique({
      where: { id: segmentId },
    });

    if (!segment || segment.brandId !== brandId || segment.crmGeneration !== 2) {
      throw new Error('Segment not found or unauthorized');
    }

    const criteria = (segment.criteriaJson || {}) as SegmentCriteria;
    const now = new Date();

    // 1. Build dynamic query object
    const where: any = { brandId, crmGeneration: 2 };

    if (criteria.minSpend !== undefined && criteria.minSpend > 0) {
      where.brandTotalSpend = { gte: criteria.minSpend };
    }
    if (criteria.minOrders !== undefined && criteria.minOrders > 0) {
      where.brandVisitCount = { gte: criteria.minOrders };
    }
    const hasRecency = (criteria.lastVisitDaysAgo ?? 0) > 0 || (criteria.visitedWithinDays ?? 0) > 0;
    if (hasRecency) {
      const restaurant = await prisma.restaurant.findFirst({ where: { brandId }, select: { timezone: true } });
      const zone = timezone(restaurant?.timezone);
      where.brandLastVisitAt = {
        ...((criteria.lastVisitDaysAgo ?? 0) > 0 ? { lt: daysAgo(criteria.lastVisitDaysAgo! - 1, zone, now) } : {}),
        ...((criteria.visitedWithinDays ?? 0) > 0 ? { gte: daysAgo(criteria.visitedWithinDays!, zone, now) } : {}),
      };
    }

    if (criteria.dietary && criteria.dietary !== 'None') {
      where.dietaryPreference = criteria.dietary;
    }
    if (criteria.seating && criteria.seating !== 'None') {
      where.seatingPreference = criteria.seating;
    }

    // 2. Query matching customers
    const matchingCustomers = await prisma.customer.findMany({
      where,
      select: { id: true },
    });

    const customerIds = matchingCustomers.map((c) => c.id);

    // 3. Sync memberships inside transaction
    await prisma.$transaction(async (tx) => {
      // Clear old segment memberships
      await tx.customerSegment.deleteMany({
        where: { segmentId },
      });

      // Insert new memberships
      if (customerIds.length > 0) {
        await tx.customerSegment.createMany({
          data: customerIds.map((customerId) => ({
            segmentId,
            customerId,
          })),
        });
      }
    });

    return customerIds.length;
  }

  // Evaluate all segments for a brand (typically run via cron)
  async evaluateAllSegmentsForBrand(brandId: string): Promise<{ processed: number; failed: number }> {
    const segments = await prisma.segment.findMany({
      where: { brandId, crmGeneration: 2 },
      select: { id: true },
    });

    let failed = 0;
    for (const segment of segments) {
      try {
        await this.evaluateSegment(segment.id, brandId);
      } catch (err) {
        failed++;
        logSafeError('segment.evaluate', err);
      }
    }
    return { processed: segments.length, failed };
  }

  // Fetch segment members list
  async getSegmentMembers(brandId: string, segmentId: string): Promise<any[]> {
    const memberships = await prisma.customerSegment.findMany({
      where: {
        segmentId,
        segment: { brandId, crmGeneration: 2 },
      },
      include: {
        customer: {
          include: {
            profiles: true,
          },
        },
      },
    });

    return memberships.map((m) => m.customer);
  }
}
