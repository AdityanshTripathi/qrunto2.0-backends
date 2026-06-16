import { prisma } from '../lib/prisma';
import { MenuItem } from '@prisma/client';

export class MenuItemRepository {
  async findMany(restaurantId: string, filters?: { categoryId?: string }): Promise<MenuItem[]> {
    const where: any = { restaurantId };
    if (filters?.categoryId) {
      where.categoryId = filters.categoryId;
    }
    
    return prisma.menuItem.findMany({
      where,
      include: {
        category: true,
      },
      orderBy: { name: 'asc' },
    });
  }

  async findById(id: string, restaurantId: string): Promise<MenuItem | null> {
    return prisma.menuItem.findFirst({
      where: { id, restaurantId },
      include: {
        category: true,
      },
    });
  }

  async count(restaurantId: string): Promise<number> {
    return prisma.menuItem.count({
      where: { restaurantId },
    });
  }

  async create(data: {
    restaurantId: string;
    categoryId: string;
    name: string;
    description?: string | null;
    price: number;
    imageUrl?: string | null;
    isAvailable?: boolean;
    isFeatured?: boolean;
  }): Promise<MenuItem> {
    return prisma.menuItem.create({
      data,
      include: {
        category: true,
      },
    });
  }

  async update(
    id: string,
    restaurantId: string,
    data: Partial<Omit<MenuItem, 'id' | 'restaurantId' | 'createdAt' | 'updatedAt'>>
  ): Promise<MenuItem> {
    await prisma.menuItem.updateMany({
      where: { id, restaurantId },
      data,
    });

    const updated = await this.findById(id, restaurantId);
    if (!updated) {
      throw new Error('Menu item not found or unauthorized');
    }
    return updated;
  }

  async delete(id: string, restaurantId: string): Promise<MenuItem> {
    const item = await this.findById(id, restaurantId);
    if (!item) {
      throw new Error('Menu item not found or unauthorized');
    }

    await prisma.menuItem.delete({
      where: { id },
    });

    return item;
  }
}
