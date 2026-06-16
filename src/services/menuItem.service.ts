import { MenuItemRepository } from '../repositories/menuItem.repository';
import { CategoryRepository } from '../repositories/category.repository';
import { SubscriptionRepository } from '../repositories/subscription.repository';
import { MenuItem } from '@prisma/client';

const menuItemRepository = new MenuItemRepository();
const categoryRepository = new CategoryRepository();
const subscriptionRepository = new SubscriptionRepository();

export class MenuItemService {
  async getMenuItems(restaurantId: string, filters?: { categoryId?: string }): Promise<MenuItem[]> {
    return menuItemRepository.findMany(restaurantId, filters);
  }

  async getMenuItemById(id: string, restaurantId: string): Promise<MenuItem | null> {
    return menuItemRepository.findById(id, restaurantId);
  }

  async createMenuItem(
    restaurantId: string,
    data: {
      categoryId: string;
      name: string;
      description?: string | null;
      price: number;
      imageUrl?: string | null;
      isAvailable?: boolean;
      isFeatured?: boolean;
    }
  ): Promise<MenuItem> {
    // 1. Enforce subscription plan limits
    const activeSub = await subscriptionRepository.findActiveSubscriptionByRestaurantId(restaurantId);
    if (!activeSub) {
      throw new Error('No active subscription plan found. Please select a plan to add menu items.');
    }

    const maxItems = activeSub.plan.maxMenuItems;
    const currentCount = await menuItemRepository.count(restaurantId);
    if (currentCount >= maxItems) {
      throw new Error(`Menu item limit reached. Your plan allows up to ${maxItems} items. Please upgrade.`);
    }

    // 2. Enforce category ownership/isolation
    const category = await categoryRepository.findById(data.categoryId, restaurantId);
    if (!category) {
      throw new Error('Category not found or unauthorized');
    }

    // 3. Create menu item
    return menuItemRepository.create({
      restaurantId,
      ...data,
    });
  }

  async updateMenuItem(
    id: string,
    restaurantId: string,
    data: {
      categoryId?: string;
      name?: string;
      description?: string | null;
      price?: number;
      imageUrl?: string | null;
      isAvailable?: boolean;
      isFeatured?: boolean;
    }
  ): Promise<MenuItem> {
    // 1. Verify existence and ownership of menu item
    const item = await menuItemRepository.findById(id, restaurantId);
    if (!item) {
      throw new Error('Menu item not found or unauthorized');
    }

    // 2. Verify category ownership if changing category
    if (data.categoryId && data.categoryId !== item.categoryId) {
      const category = await categoryRepository.findById(data.categoryId, restaurantId);
      if (!category) {
        throw new Error('Category not found or unauthorized');
      }
    }

    // 3. Perform update
    return menuItemRepository.update(id, restaurantId, data);
  }

  async deleteMenuItem(id: string, restaurantId: string): Promise<MenuItem> {
    // 1. Verify existence and ownership
    const item = await menuItemRepository.findById(id, restaurantId);
    if (!item) {
      throw new Error('Menu item not found or unauthorized');
    }

    // 2. Perform delete
    return menuItemRepository.delete(id, restaurantId);
  }
}
