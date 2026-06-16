import { CategoryRepository } from '../repositories/category.repository';
import { Category } from '@prisma/client';

const categoryRepository = new CategoryRepository();

export class CategoryService {
  async getCategories(restaurantId: string): Promise<Category[]> {
    return categoryRepository.findMany(restaurantId);
  }

  async getActiveCategories(restaurantId: string): Promise<Category[]> {
    return categoryRepository.findActive(restaurantId);
  }

  async createCategory(
    restaurantId: string,
    data: { name: string; displayOrder?: number }
  ): Promise<Category> {
    let order = data.displayOrder;
    
    // If displayOrder is not provided, append it to the end
    if (order === undefined) {
      const existing = await categoryRepository.findMany(restaurantId);
      order = existing.length > 0 
        ? Math.max(...existing.map(c => c.displayOrder)) + 1 
        : 1;
    }

    return categoryRepository.create({
      restaurantId,
      name: data.name,
      displayOrder: order,
      isActive: true,
    });
  }

  async updateCategory(
    id: string,
    restaurantId: string,
    data: { name?: string; displayOrder?: number; isActive?: boolean }
  ): Promise<Category> {
    // 1. Verify existence and ownership
    const category = await categoryRepository.findById(id, restaurantId);
    if (!category) {
      throw new Error('Category not found or unauthorized');
    }

    // 2. Perform scoped update
    return categoryRepository.update(id, restaurantId, data);
  }

  async deleteCategory(id: string, restaurantId: string): Promise<Category> {
    // 1. Verify existence and ownership
    const category = await categoryRepository.findById(id, restaurantId);
    if (!category) {
      throw new Error('Category not found or unauthorized');
    }

    // 2. Perform soft delete
    return categoryRepository.softDelete(id, restaurantId);
  }
}
