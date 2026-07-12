import { Request, Response } from 'express';
import { z } from 'zod';
import { RecipeService } from '../../services/inventory/recipe.service';

const recipeService = new RecipeService();

const CreateRecipeIngredientSchema = z.object({
  rawMaterialId: z.string().uuid('Invalid raw material ID'),
  quantity: z.number().positive('Quantity must be greater than 0'),
});

const CreateRecipeSchema = z.object({
  menuItemId: z.string().uuid('Invalid menu item ID'),
  notes: z.string().max(1000).optional().nullable(),
  ingredients: z.array(CreateRecipeIngredientSchema).min(1, 'At least one ingredient is required'),
});

const UpdateRecipeSchema = z.object({
  notes: z.string().max(1000).optional().nullable(),
  ingredients: z.array(CreateRecipeIngredientSchema).optional(),
});

export class RecipeController {
  async getRecipes(req: Request, res: Response): Promise<void> {
    try {
      if (!req.user) {
        res.status(401).json({ error: 'Authentication required' });
        return;
      }

      const restaurantId = req.user.restaurantId;
      if (!restaurantId) {
        res.status(400).json({ error: 'No restaurant associated with this session' });
        return;
      }

      const recipes = await recipeService.getRecipes(restaurantId);
      res.status(200).json({ recipes });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  }

  async getRecipeByMenuItemId(req: Request, res: Response): Promise<void> {
    try {
      if (!req.user) {
        res.status(401).json({ error: 'Authentication required' });
        return;
      }

      const restaurantId = req.user.restaurantId;
      if (!restaurantId) {
        res.status(400).json({ error: 'No restaurant associated with this session' });
        return;
      }

      const menuItemId = req.params['menuItemId'] as string;
      const recipe = await recipeService.getRecipeByMenuItemId(menuItemId, restaurantId);
      if (!recipe) {
        res.status(404).json({ error: 'Recipe not found for this menu item' });
        return;
      }

      res.status(200).json({ recipe });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  }

  async createRecipe(req: Request, res: Response): Promise<void> {
    try {
      if (!req.user) {
        res.status(401).json({ error: 'Authentication required' });
        return;
      }

      const restaurantId = req.user.restaurantId;
      if (!restaurantId) {
        res.status(400).json({ error: 'No restaurant associated with this session' });
        return;
      }

      const validationResult = CreateRecipeSchema.safeParse(req.body);
      if (!validationResult.success) {
        res.status(400).json({ errors: validationResult.error.flatten().fieldErrors });
        return;
      }

      const data = validationResult.data;
      const payload: any = {
        menuItemId: data.menuItemId,
        ingredients: data.ingredients,
      };
      if (data.notes !== undefined && data.notes !== null) {
        payload.notes = data.notes;
      }
      const recipe = await recipeService.createRecipe(restaurantId, payload);

      res.status(201).json({ recipe });
    } catch (err: any) {
      res.status(400).json({ error: err.message });
    }
  }

  async updateRecipe(req: Request, res: Response): Promise<void> {
    try {
      if (!req.user) {
        res.status(401).json({ error: 'Authentication required' });
        return;
      }

      const restaurantId = req.user.restaurantId;
      if (!restaurantId) {
        res.status(400).json({ error: 'No restaurant associated with this session' });
        return;
      }

      const id = req.params['id'] as string;
      const validationResult = UpdateRecipeSchema.safeParse(req.body);
      if (!validationResult.success) {
        res.status(400).json({ errors: validationResult.error.flatten().fieldErrors });
        return;
      }

      const data = validationResult.data;
      const payload: any = {};
      if (data.notes !== undefined && data.notes !== null) payload.notes = data.notes;
      if (data.ingredients !== undefined) payload.ingredients = data.ingredients;

      const recipe = await recipeService.updateRecipe(id, restaurantId, payload);

      res.status(200).json({ recipe });
    } catch (err: any) {
      res.status(400).json({ error: err.message });
    }
  }
}
