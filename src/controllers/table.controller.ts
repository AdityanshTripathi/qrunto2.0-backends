import { Request, Response } from 'express';
import { z } from 'zod';
import { TableService } from '../services/table.service';

const tableService = new TableService();

const CreateTableSchema = z.object({
  tableNumber: z.string().min(1, 'Table number is required').max(20, 'Table number is too long'),
});

const UpdateTableSchema = z.object({
  tableNumber: z.string().min(1).max(20).optional(),
  isActive: z.boolean().optional(),
});

export class TableController {
  async getTables(req: Request, res: Response): Promise<void> {
    try {
      if (!req.user) { res.status(401).json({ error: 'Authentication required' }); return; }
      const restaurantId = req.user.restaurantId;
      if (!restaurantId) { res.status(400).json({ error: 'No restaurant associated with this session' }); return; }

      const tables = await tableService.getTables(restaurantId);
      res.status(200).json({ tables });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  }

  async createTable(req: Request, res: Response): Promise<void> {
    try {
      if (!req.user) { res.status(401).json({ error: 'Authentication required' }); return; }
      const restaurantId = req.user.restaurantId;
      if (!restaurantId) { res.status(400).json({ error: 'No restaurant associated with this session' }); return; }

      const validationResult = CreateTableSchema.safeParse(req.body);
      if (!validationResult.success) {
        res.status(400).json({ errors: validationResult.error.flatten().fieldErrors });
        return;
      }

      const table = await tableService.createTable(restaurantId, validationResult.data.tableNumber);
      res.status(201).json({ table });
    } catch (err: any) {
      res.status(400).json({ error: err.message });
    }
  }

  async updateTable(req: Request, res: Response): Promise<void> {
    try {
      if (!req.user) { res.status(401).json({ error: 'Authentication required' }); return; }
      const restaurantId = req.user.restaurantId;
      if (!restaurantId) { res.status(400).json({ error: 'No restaurant associated with this session' }); return; }

      const id = req.params['id'] as string;
      if (!id) { res.status(400).json({ error: 'Table ID is required' }); return; }

      const validationResult = UpdateTableSchema.safeParse(req.body);
      if (!validationResult.success) {
        res.status(400).json({ errors: validationResult.error.flatten().fieldErrors });
        return;
      }

      const payload: { tableNumber?: string; isActive?: boolean } = {};
      if (validationResult.data.tableNumber !== undefined) payload.tableNumber = validationResult.data.tableNumber;
      if (validationResult.data.isActive !== undefined) payload.isActive = validationResult.data.isActive;

      const table = await tableService.updateTable(id, restaurantId, payload);
      res.status(200).json({ table });
    } catch (err: any) {
      res.status(400).json({ error: err.message });
    }
  }

  async deleteTable(req: Request, res: Response): Promise<void> {
    try {
      if (!req.user) { res.status(401).json({ error: 'Authentication required' }); return; }
      const restaurantId = req.user.restaurantId;
      if (!restaurantId) { res.status(400).json({ error: 'No restaurant associated with this session' }); return; }

      const id = req.params['id'] as string;
      if (!id) { res.status(400).json({ error: 'Table ID is required' }); return; }

      const table = await tableService.deleteTable(id, restaurantId);
      res.status(200).json({ table, message: 'Table deactivated successfully' });
    } catch (err: any) {
      res.status(400).json({ error: err.message });
    }
  }
}
