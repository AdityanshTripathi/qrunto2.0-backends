import { Request, Response } from 'express';
import { z } from 'zod';
import { CategoryService } from '../services/category.service';

const categoryService = new CategoryService();

const CreateCategorySchema = z.object({
  name: z.string().min(1, 'Category name is required').max(100),
  displayOrder: z.number().int().optional(),
});

const UpdateCategorySchema = z.object({
  name: z.string().min(1, 'Category name is required').max(100).optional(),
  displayOrder: z.number().int().optional(),
  isActive: z.boolean().optional(),
});

export class CategoryController {
  async getCategories(req: Request, res: Response): Promise<void> {
    try {
      if (!req.user) {
        res.status(401).json({ error: 'Authentication required' });
        return;
      }

      const restaurantId = req.user.restaurantId;
      if (!restaurantId) {
        res.status(400).json({ error: 'No restaurant associated with this user session' });
        return;
      }

      const categories = await categoryService.getCategories(restaurantId);
      res.status(200).json({ categories });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  }

  async createCategory(req: Request, res: Response): Promise<void> {
    try {
      if (!req.user) {
        res.status(401).json({ error: 'Authentication required' });
        return;
      }

      const restaurantId = req.user.restaurantId;
      if (!restaurantId) {
        res.status(400).json({ error: 'No restaurant associated with this user session' });
        return;
      }

      const validationResult = CreateCategorySchema.safeParse(req.body);
      if (!validationResult.success) {
        res.status(400).json({ errors: validationResult.error.flatten().fieldErrors });
        return;
      }

      // Handle exactOptionalPropertyTypes by explicitly building the payload
      const payload: { name: string; displayOrder?: number } = {
        name: validationResult.data.name,
      };
      if (validationResult.data.displayOrder !== undefined) {
        payload.displayOrder = validationResult.data.displayOrder;
      }

      const category = await categoryService.createCategory(restaurantId, payload);
      res.status(201).json({ category });
    } catch (err: any) {
      res.status(400).json({ error: err.message });
    }
  }

  async updateCategory(req: Request, res: Response): Promise<void> {
    try {
      if (!req.user) {
        res.status(401).json({ error: 'Authentication required' });
        return;
      }

      const restaurantId = req.user.restaurantId;
      if (!restaurantId) {
        res.status(400).json({ error: 'No restaurant associated with this user session' });
        return;
      }

      const id = req.params['id'] as string;
      if (!id) {
        res.status(400).json({ error: 'Category ID is required' });
        return;
      }

      const validationResult = UpdateCategorySchema.safeParse(req.body);
      if (!validationResult.success) {
        res.status(400).json({ errors: validationResult.error.flatten().fieldErrors });
        return;
      }

      // Handle exactOptionalPropertyTypes by explicitly building the payload
      const payload: { name?: string; displayOrder?: number; isActive?: boolean } = {};
      if (validationResult.data.name !== undefined) payload.name = validationResult.data.name;
      if (validationResult.data.displayOrder !== undefined) payload.displayOrder = validationResult.data.displayOrder;
      if (validationResult.data.isActive !== undefined) payload.isActive = validationResult.data.isActive;

      const category = await categoryService.updateCategory(id, restaurantId, payload);
      res.status(200).json({ category });
    } catch (err: any) {
      res.status(400).json({ error: err.message });
    }
  }

  async deleteCategory(req: Request, res: Response): Promise<void> {
    try {
      if (!req.user) {
        res.status(401).json({ error: 'Authentication required' });
        return;
      }

      const restaurantId = req.user.restaurantId;
      if (!restaurantId) {
        res.status(400).json({ error: 'No restaurant associated with this user session' });
        return;
      }

      const id = req.params['id'] as string;
      if (!id) {
        res.status(400).json({ error: 'Category ID is required' });
        return;
      }

      const category = await categoryService.deleteCategory(id, restaurantId);
      res.status(200).json({ category, message: 'Category soft-deleted successfully' });
    } catch (err: any) {
      res.status(400).json({ error: err.message });
    }
  }
}
