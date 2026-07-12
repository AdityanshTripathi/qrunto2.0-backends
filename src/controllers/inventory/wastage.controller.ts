import { Request, Response } from 'express';
import { z } from 'zod';
import { WastageService } from '../../services/inventory/wastage.service';
import { WastageReason } from '@prisma/client';

const wastageService = new WastageService();

const CreateWastageRecordSchema = z.object({
  rawMaterialId: z.string().uuid('Invalid raw material ID'),
  quantity: z.number().positive('Quantity must be greater than 0'),
  reason: z.nativeEnum(WastageReason),
  notes: z.string().max(1000).optional().nullable(),
  wasteDate: z.string().datetime().optional().nullable(),
});

export class WastageController {
  async getWastageRecords(req: Request, res: Response): Promise<void> {
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

      const wastageRecords = await wastageService.getWastageRecords(restaurantId);
      res.status(200).json({ wastageRecords });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  }

  async createWastageRecord(req: Request, res: Response): Promise<void> {
    try {
      if (!req.user) {
        res.status(401).json({ error: 'Authentication required' });
        return;
      }

      const restaurantId = req.user.restaurantId;
      const userId = req.user.id;
      if (!restaurantId) {
        res.status(400).json({ error: 'No restaurant associated with this session' });
        return;
      }

      const validationResult = CreateWastageRecordSchema.safeParse(req.body);
      if (!validationResult.success) {
        res.status(400).json({ errors: validationResult.error.flatten().fieldErrors });
        return;
      }

      const data = validationResult.data;
      const payload: any = {
        rawMaterialId: data.rawMaterialId,
        quantity: data.quantity,
        reason: data.reason,
      };
      if (data.notes !== undefined && data.notes !== null) {
        payload.notes = data.notes;
      }
      if (data.wasteDate !== undefined && data.wasteDate !== null) {
        payload.wasteDate = new Date(data.wasteDate);
      }

      const record = await wastageService.createWastageRecord(restaurantId, userId, payload);
      res.status(201).json({ record });
    } catch (err: any) {
      res.status(400).json({ error: err.message });
    }
  }
}
