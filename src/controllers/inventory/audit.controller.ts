import { Request, Response } from 'express';
import { z } from 'zod';
import { AuditService } from '../../services/inventory/audit.service';

const auditService = new AuditService();

const CreateAuditItemSchema = z.object({
  rawMaterialId: z.string().uuid('Invalid raw material ID'),
  actualStock: z.number().nonnegative('Stock count cannot be negative'),
  notes: z.string().max(200).optional().nullable(),
});

const CreateAuditSchema = z.object({
  notes: z.string().max(1000).optional().nullable(),
  items: z.array(CreateAuditItemSchema).min(1, 'At least one item must be audited'),
});

export class AuditController {
  async getAudits(req: Request, res: Response): Promise<void> {
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

      const audits = await auditService.getAudits(restaurantId);
      res.status(200).json({ audits });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  }

  async createAudit(req: Request, res: Response): Promise<void> {
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

      const validationResult = CreateAuditSchema.safeParse(req.body);
      if (!validationResult.success) {
        res.status(400).json({ errors: validationResult.error.flatten().fieldErrors });
        return;
      }

      const data = validationResult.data;
      const payload: any = {
        items: data.items.map(item => {
          const itemPayload: any = {
            rawMaterialId: item.rawMaterialId,
            actualStock: item.actualStock,
          };
          if (item.notes !== undefined && item.notes !== null) {
            itemPayload.notes = item.notes;
          }
          return itemPayload;
        }),
      };
      if (data.notes !== undefined && data.notes !== null) {
        payload.notes = data.notes;
      }

      const audit = await auditService.createAudit(restaurantId, userId, payload);

      res.status(201).json({ audit });
    } catch (err: any) {
      res.status(400).json({ error: err.message });
    }
  }
}
