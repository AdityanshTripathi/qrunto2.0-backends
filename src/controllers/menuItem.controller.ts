import { Request, Response } from 'express';
import { z } from 'zod';
import { MenuItemService } from '../services/menuItem.service';

const menuItemService = new MenuItemService();

const CreateMenuItemSchema = z.object({
  categoryId: z.string().uuid('Invalid category ID format'),
  name: z.string().min(1, 'Menu item name is required').max(100),
  description: z.string().max(500).nullable().optional(),
  price: z.number().nonnegative('Price must be a non-negative number'),
  imageUrl: z.string().nullable().optional(),
  isAvailable: z.boolean().optional(),
  isFeatured: z.boolean().optional(),
});

const UpdateMenuItemSchema = z.object({
  categoryId: z.string().uuid('Invalid category ID format').optional(),
  name: z.string().min(1, 'Menu item name is required').max(100).optional(),
  description: z.string().max(500).nullable().optional(),
  price: z.number().nonnegative('Price must be a non-negative number').optional(),
  imageUrl: z.string().nullable().optional(),
  isAvailable: z.boolean().optional(),
  isFeatured: z.boolean().optional(),
});

export class MenuItemController {
  async getMenuItems(req: Request, res: Response): Promise<void> {
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

      const categoryId = req.query['categoryId'] as string | undefined;
      const filters = categoryId ? { categoryId } : undefined;

      const menuItems = await menuItemService.getMenuItems(restaurantId, filters);
      res.status(200).json({ menuItems });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  }

  async getMenuItemById(req: Request, res: Response): Promise<void> {
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
        res.status(400).json({ error: 'Menu item ID is required' });
        return;
      }

      const menuItem = await menuItemService.getMenuItemById(id, restaurantId);
      if (!menuItem) {
        res.status(404).json({ error: 'Menu item not found' });
        return;
      }

      res.status(200).json({ menuItem });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  }

  async createMenuItem(req: Request, res: Response): Promise<void> {
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

      const validationResult = CreateMenuItemSchema.safeParse(req.body);
      if (!validationResult.success) {
        res.status(400).json({ errors: validationResult.error.flatten().fieldErrors });
        return;
      }

      // Handle exactOptionalPropertyTypes by explicitly building the payload
      const data = validationResult.data;
      const payload: {
        categoryId: string;
        name: string;
        description?: string | null;
        price: number;
        imageUrl?: string | null;
        isAvailable?: boolean;
        isFeatured?: boolean;
      } = {
        categoryId: data.categoryId,
        name: data.name,
        price: data.price,
      };

      if (data.description !== undefined) payload.description = data.description;
      if (data.imageUrl !== undefined) payload.imageUrl = data.imageUrl;
      if (data.isAvailable !== undefined) payload.isAvailable = data.isAvailable;
      if (data.isFeatured !== undefined) payload.isFeatured = data.isFeatured;

      const menuItem = await menuItemService.createMenuItem(restaurantId, payload);
      res.status(201).json({ menuItem });
    } catch (err: any) {
      res.status(400).json({ error: err.message });
    }
  }

  async updateMenuItem(req: Request, res: Response): Promise<void> {
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
        res.status(400).json({ error: 'Menu item ID is required' });
        return;
      }

      const validationResult = UpdateMenuItemSchema.safeParse(req.body);
      if (!validationResult.success) {
        res.status(400).json({ errors: validationResult.error.flatten().fieldErrors });
        return;
      }

      // Handle exactOptionalPropertyTypes by explicitly building the payload
      const data = validationResult.data;
      const payload: {
        categoryId?: string;
        name?: string;
        description?: string | null;
        price?: number;
        imageUrl?: string | null;
        isAvailable?: boolean;
        isFeatured?: boolean;
      } = {};

      if (data.categoryId !== undefined) payload.categoryId = data.categoryId;
      if (data.name !== undefined) payload.name = data.name;
      if (data.description !== undefined) payload.description = data.description;
      if (data.price !== undefined) payload.price = data.price;
      if (data.imageUrl !== undefined) payload.imageUrl = data.imageUrl;
      if (data.isAvailable !== undefined) payload.isAvailable = data.isAvailable;
      if (data.isFeatured !== undefined) payload.isFeatured = data.isFeatured;

      const menuItem = await menuItemService.updateMenuItem(id, restaurantId, payload);
      res.status(200).json({ menuItem });
    } catch (err: any) {
      res.status(400).json({ error: err.message });
    }
  }

  async deleteMenuItem(req: Request, res: Response): Promise<void> {
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
        res.status(400).json({ error: 'Menu item ID is required' });
        return;
      }

      const menuItem = await menuItemService.deleteMenuItem(id, restaurantId);
      res.status(200).json({ menuItem, message: 'Menu item deleted successfully' });
    } catch (err: any) {
      res.status(400).json({ error: err.message });
    }
  }
}
