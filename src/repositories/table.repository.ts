import { prisma } from '../lib/prisma';
import { RestaurantTable } from '@prisma/client';

export class TableRepository {
  async findMany(restaurantId: string): Promise<RestaurantTable[]> {
    return prisma.restaurantTable.findMany({
      where: { restaurantId },
      orderBy: { tableNumber: 'asc' },
    });
  }

  async findById(id: string, restaurantId: string): Promise<RestaurantTable | null> {
    return prisma.restaurantTable.findFirst({
      where: { id, restaurantId },
    });
  }

  async findByTableNumber(tableNumber: string, restaurantId: string): Promise<RestaurantTable | null> {
    return prisma.restaurantTable.findFirst({
      where: { tableNumber, restaurantId },
    });
  }

  async count(restaurantId: string): Promise<number> {
    return prisma.restaurantTable.count({
      where: { restaurantId },
    });
  }

  async create(data: {
    restaurantId: string;
    tableNumber: string;
    qrCodeUrl?: string;
  }): Promise<RestaurantTable> {
    return prisma.restaurantTable.create({ data });
  }

  async update(
    id: string,
    restaurantId: string,
    data: Partial<Omit<RestaurantTable, 'id' | 'restaurantId' | 'createdAt' | 'updatedAt'>>
  ): Promise<RestaurantTable> {
    await prisma.restaurantTable.updateMany({
      where: { id, restaurantId },
      data,
    });
    const updated = await this.findById(id, restaurantId);
    if (!updated) throw new Error('Table not found or unauthorized');
    return updated;
  }

  async softDelete(id: string, restaurantId: string): Promise<RestaurantTable> {
    return this.update(id, restaurantId, { isActive: false });
  }
}
