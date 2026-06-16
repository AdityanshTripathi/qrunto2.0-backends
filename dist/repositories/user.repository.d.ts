import { User, Restaurant } from '@prisma/client';
export declare class UserRepository {
    findByEmail(email: string): Promise<(User & {
        restaurants: Restaurant[];
    }) | null>;
    findById(id: string): Promise<User | null>;
    createUserWithRestaurant(userData: Omit<User, 'id' | 'createdAt' | 'updatedAt'>, restaurantName: string, restaurantSlug: string): Promise<{
        user: User;
        restaurant: Restaurant;
    }>;
}
//# sourceMappingURL=user.repository.d.ts.map