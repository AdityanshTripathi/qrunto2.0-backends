import { RecipeRepository } from '../../repositories/inventory/recipe.repository';
import { Recipe } from '@prisma/client';

const recipeRepository = new RecipeRepository();

export interface RecipeCostMetrics {
  foodCost: number;
  foodCostPercentage: number;
  grossProfit: number;
  marginPercentage: number;
}

export type RecipeWithMetrics = Recipe & {
  metrics: RecipeCostMetrics;
};

function getConversionFactor(materialUnit: string): number {
  const unit = (materialUnit || '').toUpperCase().trim();
  if (unit === 'KG' || unit === 'LTR' || unit === 'L') {
    return 1000;
  }
  return 1;
}

export class RecipeService {
  private calculateMetrics(recipe: any): RecipeCostMetrics {
    const menuItemPrice = recipe.menuItem?.price || 0;
    
    // Food Cost = sum((RecipeIngredient.quantity / conversionFactor) * RawMaterial.averageCost)
    let foodCost = 0;
    if (recipe.ingredients) {
      for (const ing of recipe.ingredients) {
        const avgCost = ing.rawMaterial?.averageCost || 0;
        const conversionFactor = getConversionFactor(ing.rawMaterial?.unit);
        const scaledQuantity = ing.quantity / conversionFactor;
        foodCost += scaledQuantity * avgCost;
      }
    }

    // Food Cost % = (Food Cost / MenuItem.price) * 100
    const foodCostPercentage = menuItemPrice > 0 ? (foodCost / menuItemPrice) * 100 : 0;

    // Gross Profit = MenuItem.price - Food Cost
    const grossProfit = menuItemPrice - foodCost;

    // Margin % = (Gross Profit / MenuItem.price) * 100
    const marginPercentage = menuItemPrice > 0 ? (grossProfit / menuItemPrice) * 100 : 0;

    return {
      foodCost,
      foodCostPercentage,
      grossProfit,
      marginPercentage,
    };
  }

  async getRecipes(restaurantId: string): Promise<RecipeWithMetrics[]> {
    const recipes = await recipeRepository.findMany(restaurantId);
    return recipes.map(recipe => ({
      ...recipe,
      metrics: this.calculateMetrics(recipe),
    })) as RecipeWithMetrics[];
  }

  async getRecipeByMenuItemId(menuItemId: string, restaurantId: string): Promise<RecipeWithMetrics | null> {
    const recipe = await recipeRepository.findByMenuItemId(menuItemId, restaurantId);
    if (!recipe) return null;
    return {
      ...recipe,
      metrics: this.calculateMetrics(recipe),
    } as RecipeWithMetrics;
  }

  async getRecipeById(id: string, restaurantId: string): Promise<RecipeWithMetrics | null> {
    const recipe = await recipeRepository.findById(id, restaurantId);
    if (!recipe) return null;
    return {
      ...recipe,
      metrics: this.calculateMetrics(recipe),
    } as RecipeWithMetrics;
  }

  async createRecipe(
    restaurantId: string,
    data: {
      menuItemId: string;
      notes?: string;
      ingredients: Array<{
        rawMaterialId: string;
        quantity: number;
      }>;
    }
  ): Promise<Recipe> {
    return recipeRepository.create(restaurantId, data);
  }

  async updateRecipe(
    id: string,
    restaurantId: string,
    data: {
      notes?: string;
      ingredients?: Array<{
        rawMaterialId: string;
        quantity: number;
      }>;
    }
  ): Promise<Recipe> {
    return recipeRepository.update(id, restaurantId, data);
  }
}
