import { prisma } from '../../lib/prisma';

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
      where: { brandId, name: { equals: name, mode: 'insensitive' } },
    });

    if (existing) {
      throw new Error(`A segment with the name "${name}" already exists`);
    }

    const segment = await prisma.segment.create({
      data: {
        brandId,
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
      where: { brandId },
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
      where: { id: segmentId, brandId },
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

    if (!segment || segment.brandId !== brandId) {
      throw new Error('Segment not found or unauthorized');
    }

    const criteria = (segment.criteriaJson || {}) as SegmentCriteria;
    const now = new Date();

    // 1. Build dynamic query object
    const where: any = { brandId };

    const profileFilters: any = {};
    if (criteria.minSpend !== undefined && criteria.minSpend > 0) {
      profileFilters.totalSpend = { gte: criteria.minSpend };
    }
    if (criteria.minOrders !== undefined && criteria.minOrders > 0) {
      profileFilters.totalOrders = { gte: criteria.minOrders };
    }
    if (criteria.lastVisitDaysAgo !== undefined && criteria.lastVisitDaysAgo > 0) {
      const dateLimit = new Date();
      dateLimit.setDate(now.getDate() - criteria.lastVisitDaysAgo);
      profileFilters.lastVisit = { lte: dateLimit };
    }
    if (criteria.visitedWithinDays !== undefined && criteria.visitedWithinDays > 0) {
      const dateLimit = new Date();
      dateLimit.setDate(now.getDate() - criteria.visitedWithinDays);
      profileFilters.lastVisit = { ...profileFilters.lastVisit, gte: dateLimit };
    }

    if (Object.keys(profileFilters).length > 0) {
      where.profiles = {
        some: profileFilters,
      };
    }

    // JSON metadata tags checks
    if (criteria.dietary && criteria.dietary !== 'None') {
      where.metadataJson = {
        path: ['dietary'],
        equals: criteria.dietary,
      };
    }
    if (criteria.seating && criteria.seating !== 'None') {
      where.metadataJson = {
        ...where.metadataJson,
        path: ['seating'],
        equals: criteria.seating,
      };
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
  async evaluateAllSegmentsForBrand(brandId: string): Promise<void> {
    const segments = await prisma.segment.findMany({
      where: { brandId },
      select: { id: true },
    });

    for (const segment of segments) {
      try {
        await this.evaluateSegment(segment.id, brandId);
      } catch (err) {
        console.error(`Failed to evaluate segment ${segment.id}:`, err);
      }
    }
  }

  // Fetch segment members list
  async getSegmentMembers(brandId: string, segmentId: string): Promise<any[]> {
    const memberships = await prisma.customerSegment.findMany({
      where: {
        segmentId,
        segment: { brandId },
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
