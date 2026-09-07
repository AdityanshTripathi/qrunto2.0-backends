import { RecipeRepository } from '../../repositories/inventory/recipe.repository';
import { Recipe } from '@prisma/client';
import { decimal, money, moneyNumber } from '../../lib/money';

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
    const menuItemPrice = decimal(recipe.menuItem?.price ?? 0);
    
    // Food Cost = sum((RecipeIngredient.quantity / conversionFactor) * RawMaterial.averageCost)
    let foodCost = decimal(0);
    if (recipe.ingredients) {
      for (const ing of recipe.ingredients) {
        const avgCost = decimal(ing.rawMaterial?.averageCost ?? 0);
        const conversionFactor = getConversionFactor(ing.rawMaterial?.unit);
        const scaledQuantity = decimal(ing.quantity).dividedBy(conversionFactor);
        foodCost = foodCost.plus(scaledQuantity.times(avgCost));
      }
    }

    // Food Cost % = (Food Cost / MenuItem.price) * 100
    const roundedFoodCost = money(foodCost);
    const foodCostPercentage = menuItemPrice.gt(0)
      ? moneyNumber(foodCost.dividedBy(menuItemPrice).times(100).toDecimalPlaces(2))
      : 0;

    // Gross Profit = MenuItem.price - Food Cost
    const grossProfit = money(menuItemPrice.minus(roundedFoodCost));

    // Margin % = (Gross Profit / MenuItem.price) * 100
    const marginPercentage = menuItemPrice.gt(0)
      ? moneyNumber(grossProfit.dividedBy(menuItemPrice).times(100).toDecimalPlaces(2))
      : 0;

    return {
      foodCost: moneyNumber(roundedFoodCost),
      foodCostPercentage,
      grossProfit: moneyNumber(grossProfit),
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
