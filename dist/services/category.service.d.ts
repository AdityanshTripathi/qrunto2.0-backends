import { Category } from '@prisma/client';
export declare class CategoryService {
    getCategories(restaurantId: string): Promise<Category[]>;
    getActiveCategories(restaurantId: string): Promise<Category[]>;
    createCategory(restaurantId: string, data: {
        name: string;
        displayOrder?: number;
    }): Promise<Category>;
    updateCategory(id: string, restaurantId: string, data: {
        name?: string;
        displayOrder?: number;
        isActive?: boolean;
    }): Promise<Category>;
    deleteCategory(id: string, restaurantId: string): Promise<Category>;
}
//# sourceMappingURL=category.service.d.ts.map