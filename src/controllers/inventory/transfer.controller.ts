import { Request, Response } from 'express';
import { z } from 'zod';
import { TransferService } from '../../services/inventory/transfer.service';

const transferService = new TransferService();

const CreateTransferItemSchema = z.object({
  rawMaterialId: z.string().uuid('Invalid raw material ID'),
  quantity: z.number().positive('Quantity must be greater than 0'),
});

const CreateTransferSchema = z.object({
  destBranchId: z.string().uuid('Invalid destination branch ID'),
  notes: z.string().max(1000).optional().nullable(),
  items: z.array(CreateTransferItemSchema).min(1, 'At least one item must be transferred'),
});

export class TransferController {
  async getTransfers(req: Request, res: Response): Promise<void> {
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

      const transfers = await transferService.getTransfers(restaurantId);
      res.status(200).json({ transfers });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  }

  async createTransfer(req: Request, res: Response): Promise<void> {
    try {
      if (!req.user) {
        res.status(401).json({ error: 'Authentication required' });
        return;
      }

      const sourceBranchId = req.user.restaurantId;
      const userId = req.user.id;
      if (!sourceBranchId) {
        res.status(400).json({ error: 'No restaurant associated with this session' });
        return;
      }

      const validationResult = CreateTransferSchema.safeParse(req.body);
      if (!validationResult.success) {
        res.status(400).json({ errors: validationResult.error.flatten().fieldErrors });
        return;
      }

      const data = validationResult.data;
      const payload: any = {
        destBranchId: data.destBranchId,
        items: data.items,
      };
      if (data.notes !== undefined && data.notes !== null) {
        payload.notes = data.notes;
      }
      const transfer = await transferService.createTransfer(sourceBranchId, userId, payload);

      res.status(201).json({ transfer, message: 'Stock transfer request initiated successfully' });
    } catch (err: any) {
      res.status(400).json({ error: err.message });
    }
  }

  async approveTransfer(req: Request, res: Response): Promise<void> {
    try {
      if (!req.user) {
        res.status(401).json({ error: 'Authentication required' });
        return;
      }

      const destBranchId = req.user.restaurantId;
      const userId = req.user.id;
      if (!destBranchId) {
        res.status(400).json({ error: 'No restaurant associated with this session' });
        return;
      }

      const id = req.params['id'] as string;
      const transfer = await transferService.approveTransfer(id, destBranchId, userId);
      res.status(200).json({ transfer, message: 'Stock transfer approved and received successfully' });
    } catch (err: any) {
      res.status(400).json({ error: err.message });
    }
  }

  async rejectTransfer(req: Request, res: Response): Promise<void> {
    try {
      if (!req.user) {
        res.status(401).json({ error: 'Authentication required' });
        return;
      }

      const destBranchId = req.user.restaurantId;
      const userId = req.user.id;
      if (!destBranchId) {
        res.status(400).json({ error: 'No restaurant associated with this session' });
        return;
      }

      const id = req.params['id'] as string;
      const transfer = await transferService.rejectTransfer(id, destBranchId, userId);
      res.status(200).json({ transfer, message: 'Stock transfer rejected and stock returned successfully' });
    } catch (err: any) {
      res.status(400).json({ error: err.message });
    }
  }
}
