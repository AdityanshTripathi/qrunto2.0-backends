import { prisma } from '../lib/prisma';
import { Category } from '@prisma/client';

export class CategoryRepository {
  async findMany(restaurantId: string): Promise<Category[]> {
    return prisma.category.findMany({
      where: { restaurantId },
      orderBy: { displayOrder: 'asc' },
    });
  }

  async findActive(restaurantId: string): Promise<Category[]> {
    return prisma.category.findMany({
      where: { 
        restaurantId,
        isActive: true,
      },
      orderBy: { displayOrder: 'asc' },
    });
  }

  async findById(id: string, restaurantId: string): Promise<Category | null> {
    return prisma.category.findFirst({
      where: { id, restaurantId },
    });
  }

  async create(data: {
    restaurantId: string;
    name: string;
    displayOrder: number;
    isActive?: boolean;
  }): Promise<Category> {
    return prisma.category.create({
      data,
    });
  }

  async update(
    id: string,
    restaurantId: string,
    data: Partial<Omit<Category, 'id' | 'restaurantId' | 'createdAt' | 'updatedAt'>>
  ): Promise<Category> {
    // Note: Scoped update using updateMany to ensure multi-tenant security,
    // then fetch the updated object. This is a robust way to prevent cross-tenant writes!
    await prisma.category.updateMany({
      where: { id, restaurantId },
      data,
    });

    const updated = await this.findById(id, restaurantId);
    if (!updated) {
      throw new Error('Category not found or unauthorized');
    }
    return updated;
  }

  async softDelete(id: string, restaurantId: string): Promise<Category> {
    return this.update(id, restaurantId, { isActive: false });
  }
}
