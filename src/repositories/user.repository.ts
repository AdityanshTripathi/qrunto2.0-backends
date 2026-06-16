import { prisma } from '../lib/prisma';
import { User, UserRole, Restaurant } from '@prisma/client';

export class UserRepository {
  async findByEmail(email: string): Promise<(User & { restaurants: Restaurant[] }) | null> {
    return prisma.user.findUnique({
      where: { email },
      include: {
        restaurants: true,
      },
    });
  }

  async findById(id: string): Promise<User | null> {
    return prisma.user.findUnique({
      where: { id },
    });
  }

  async createUserWithRestaurant(
    userData: Omit<User, 'id' | 'createdAt' | 'updatedAt'>,
    restaurantName: string,
    restaurantSlug: string
  ): Promise<{ user: User; restaurant: Restaurant }> {
    return prisma.$transaction(async (tx) => {
      // 1. Create User
      const user = await tx.user.create({
        data: userData,
      });

      // 2. Create Restaurant owned by this User
      const restaurant = await tx.restaurant.create({
        data: {
          name: restaurantName,
          slug: restaurantSlug,
          ownerId: user.id,
          isActive: true,
        },
      });

      // 3. Create default settings for this restaurant
      await tx.restaurantSetting.create({
        data: {
          restaurantId: restaurant.id,
          currency: 'INR',
          taxPercentage: 0,
        },
      });

      return { user, restaurant };
    });
  }
}
