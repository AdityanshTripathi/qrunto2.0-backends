import { prisma } from '../../lib/prisma';
import { Customer } from '@prisma/client';

export class CustomerRepository {
  async findById(id: string, brandId: string): Promise<Customer | null> {
    return prisma.customer.findFirst({
      where: { id, brandId },
      include: {
        profiles: true,
        notes: {
          orderBy: { createdAt: 'desc' },
          include: {
            user: {
              select: { name: true }
            }
          }
        }
      }
    });
  }

  async findByPhone(phone: string, brandId: string): Promise<Customer | null> {
    return prisma.customer.findFirst({
      where: { phone, brandId },
      include: {
        profiles: true,
      }
    });
  }

  async create(data: {
    brandId: string;
    name: string;
    phone: string;
    email?: string | null;
    acquisitionSource?: string;
    metadataJson?: any;
  }): Promise<Customer> {
    return prisma.customer.create({
      data: {
        brandId: data.brandId,
        name: data.name,
        phone: data.phone,
        email: data.email || null,
        acquisitionSource: data.acquisitionSource || 'QR_ORDER',
        metadataJson: data.metadataJson || {},
      },
    });
  }

  async update(
    id: string,
    brandId: string,
    data: Partial<Omit<Customer, 'id' | 'brandId' | 'createdAt' | 'updatedAt'>>
  ): Promise<Customer> {
    // Multi-tenant check
    const existing = await prisma.customer.findFirst({
      where: { id, brandId },
    });
    if (!existing) {
      throw new Error('Customer not found or unauthorized');
    }

    return prisma.customer.update({
      where: { id },
      data: data as any,
    });
  }

  async findMany(
    brandId: string,
    filters: {
      search?: string;
      restaurantId?: string;
      limit?: number;
      offset?: number;
      sortBy?: string;
      sortOrder?: 'asc' | 'desc';
    } = {}
  ) {
    const limit = filters.limit ?? 20;
    const offset = filters.offset ?? 0;
    const search = filters.search?.trim();
    const sortBy = filters.sortBy ?? 'createdAt';
    const sortOrder = filters.sortOrder ?? 'desc';
    const restaurantId = filters.restaurantId;

    // Build dynamic where clause
    const whereClause: any = {
      brandId,
    };

    if (search) {
      whereClause.OR = [
        { name: { contains: search, mode: 'insensitive' } },
        { phone: { contains: search, mode: 'insensitive' } },
      ];
    }

    if (restaurantId) {
      whereClause.profiles = {
        some: {
          restaurantId,
        },
      };
    }

    // Determine query order
    let orderByClause: any = {};
    if (sortBy === 'name' || sortBy === 'createdAt' || sortBy === 'updatedAt') {
      orderByClause[sortBy] = sortOrder;
    }

    // Build include clause dynamically to prevent exactOptionalPropertyTypes errors
    const includeClause: any = {
      profiles: true,
    };

    if (restaurantId) {
      includeClause.profiles = {
        where: { restaurantId },
      };
    }

    const customers = await prisma.customer.findMany({
      where: whereClause,
      include: includeClause,
      orderBy: Object.keys(orderByClause).length > 0 ? orderByClause : { createdAt: 'desc' },
      take: limit,
      skip: offset,
    });

    // Custom sorting for profile metrics (totalSpend, totalOrders, aov, lastVisit)
    if (restaurantId && ['totalSpend', 'totalOrders', 'aov', 'lastVisit'].includes(sortBy)) {
      customers.sort((a, b) => {
        const profA = (a as any).profiles?.[0];
        const profB = (b as any).profiles?.[0];
        
        let valA: any = 0;
        let valB: any = 0;

        if (profA) valA = (profA as any)[sortBy];
        if (profB) valB = (profB as any)[sortBy];

        if (sortBy === 'lastVisit') {
          valA = valA ? new Date(valA).getTime() : 0;
          valB = valB ? new Date(valB).getTime() : 0;
        }

        return sortOrder === 'desc'
          ? (valB > valA ? 1 : -1)
          : (valA > valB ? 1 : -1);
      });
    }

    return customers;
  }

  async count(brandId: string, filters: { search?: string; restaurantId?: string } = {}): Promise<number> {
    const search = filters.search?.trim();
    const restaurantId = filters.restaurantId;

    const whereClause: any = {
      brandId,
    };

    if (search) {
      whereClause.OR = [
        { name: { contains: search, mode: 'insensitive' } },
        { phone: { contains: search, mode: 'insensitive' } },
      ];
    }

    if (restaurantId) {
      whereClause.profiles = {
        some: {
          restaurantId,
        },
      };
    }

    return prisma.customer.count({
      where: whereClause,
    });
  }
}
