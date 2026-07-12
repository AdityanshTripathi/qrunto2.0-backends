import { Recipe } from '@prisma/client';
export interface RecipeCostMetrics {
    foodCost: number;
    foodCostPercentage: number;
    grossProfit: number;
    marginPercentage: number;
}
export type RecipeWithMetrics = Recipe & {
    metrics: RecipeCostMetrics;
};
export declare class RecipeService {
    private calculateMetrics;
    getRecipes(restaurantId: string): Promise<RecipeWithMetrics[]>;
    getRecipeByMenuItemId(menuItemId: string, restaurantId: string): Promise<RecipeWithMetrics | null>;
    getRecipeById(id: string, restaurantId: string): Promise<RecipeWithMetrics | null>;
    createRecipe(restaurantId: string, data: {
        menuItemId: string;
        notes?: string;
        ingredients: Array<{
            rawMaterialId: string;
            quantity: number;
        }>;
    }): Promise<Recipe>;
    updateRecipe(id: string, restaurantId: string, data: {
        notes?: string;
        ingredients?: Array<{
            rawMaterialId: string;
            quantity: number;
        }>;
    }): Promise<Recipe>;
}
//# sourceMappingURL=recipe.service.d.ts.map