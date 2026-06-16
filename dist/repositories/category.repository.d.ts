import { Category } from '@prisma/client';
export declare class CategoryRepository {
    findMany(restaurantId: string): Promise<Category[]>;
    findActive(restaurantId: string): Promise<Category[]>;
    findById(id: string, restaurantId: string): Promise<Category | null>;
    create(data: {
        restaurantId: string;
        name: string;
        displayOrder: number;
        isActive?: boolean;
    }): Promise<Category>;
    update(id: string, restaurantId: string, data: Partial<Omit<Category, 'id' | 'restaurantId' | 'createdAt' | 'updatedAt'>>): Promise<Category>;
    softDelete(id: string, restaurantId: string): Promise<Category>;
}
//# sourceMappingURL=category.repository.d.ts.map