import { MenuItem } from '@prisma/client';
export declare class MenuItemRepository {
    findMany(restaurantId: string, filters?: {
        categoryId?: string;
    }): Promise<MenuItem[]>;
    findById(id: string, restaurantId: string): Promise<MenuItem | null>;
    count(restaurantId: string): Promise<number>;
    create(data: {
        restaurantId: string;
        categoryId: string;
        name: string;
        description?: string | null;
        price: number;
        imageUrl?: string | null;
        isAvailable?: boolean;
        isFeatured?: boolean;
    }): Promise<MenuItem>;
    update(id: string, restaurantId: string, data: Partial<Omit<MenuItem, 'id' | 'restaurantId' | 'createdAt' | 'updatedAt'>>): Promise<MenuItem>;
    delete(id: string, restaurantId: string): Promise<MenuItem>;
}
//# sourceMappingURL=menuItem.repository.d.ts.map