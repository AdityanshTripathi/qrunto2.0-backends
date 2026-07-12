import { prisma } from '../../lib/prisma';
import { Supplier } from '@prisma/client';

export class SupplierRepository {
  async findMany(restaurantId: string): Promise<Supplier[]> {
    return prisma.supplier.findMany({
      where: { restaurantId },
      orderBy: { name: 'asc' },
    });
  }

  async findActive(restaurantId: string): Promise<Supplier[]> {
    return prisma.supplier.findMany({
      where: {
        restaurantId,
        isActive: true,
      },
      orderBy: { name: 'asc' },
    });
  }

  async findById(id: string, restaurantId: string): Promise<Supplier | null> {
    return prisma.supplier.findFirst({
      where: { id, restaurantId },
    });
  }

  async create(
    restaurantId: string,
    data: {
      name: string;
      contactName?: string;
      phone: string;
      email?: string;
      gstNumber?: string;
      address?: string;
      creditDays?: number;
      outstandingBalance?: number;
      isActive?: boolean;
    }
  ): Promise<Supplier> {
    return prisma.supplier.create({
      data: {
        ...data,
        restaurantId,
      },
    });
  }

  async update(
    id: string,
    restaurantId: string,
    data: Partial<Omit<Supplier, 'id' | 'restaurantId' | 'createdAt' | 'updatedAt'>>
  ): Promise<Supplier> {
    await prisma.supplier.updateMany({
      where: { id, restaurantId },
      data,
    });

    const updated = await this.findById(id, restaurantId);
    if (!updated) {
      throw new Error('Supplier not found or unauthorized');
    }
    return updated;
  }

  async softDelete(id: string, restaurantId: string): Promise<Supplier> {
    return this.update(id, restaurantId, { isActive: false });
  }
}
