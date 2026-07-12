import { Recipe } from '@prisma/client';
export declare class RecipeRepository {
    findMany(restaurantId: string): Promise<Recipe[]>;
    findByMenuItemId(menuItemId: string, restaurantId: string): Promise<Recipe | null>;
    findById(id: string, restaurantId: string): Promise<Recipe | null>;
    create(restaurantId: string, data: {
        menuItemId: string;
        notes?: string;
        ingredients: Array<{
            rawMaterialId: string;
            quantity: number;
        }>;
    }): Promise<Recipe>;
    update(id: string, restaurantId: string, data: {
        notes?: string;
        ingredients?: Array<{
            rawMaterialId: string;
            quantity: number;
        }>;
    }): Promise<Recipe>;
}
//# sourceMappingURL=recipe.repository.d.ts.map