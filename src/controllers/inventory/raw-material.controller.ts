import { Request, Response } from 'express';
import { z } from 'zod';
import { RawMaterialService } from '../../services/inventory/raw-material.service';
import { RawMaterialStatus, LedgerActionType } from '@prisma/client';

const rawMaterialService = new RawMaterialService();

const CreateRawMaterialSchema = z.object({
  supplierId: z.string().uuid('Invalid supplier ID').optional().nullable(),
  name: z.string().min(1, 'Name is required').max(100),
  category: z.string().min(1, 'Category is required').max(100),
  sku: z.string().min(1, 'SKU is required').max(100),
  unit: z.string().min(1, 'Unit is required').max(20),
  openingStock: z.number().nonnegative(),
  currentStock: z.number().nonnegative(),
  minimumStockLevel: z.number().nonnegative(),
  maximumStockLevel: z.number().nonnegative(),
  reorderQuantity: z.number().nonnegative(),
  purchasePrice: z.number().nonnegative(),
  averageCost: z.number().nonnegative(),
  expiryDate: z.string().datetime({ precision: 3 }).or(z.string().datetime()).optional().nullable(),
  storageLocation: z.string().max(100).optional().nullable(),
  notes: z.string().max(1000).optional().nullable(),
  status: z.nativeEnum(RawMaterialStatus).optional(),
});

const UpdateRawMaterialSchema = CreateRawMaterialSchema.partial();

const AdjustStockSchema = z.object({
  rawMaterialId: z.string().uuid('Invalid raw material ID'),
  quantityChange: z.number(),
  actionType: z.nativeEnum(LedgerActionType),
  reason: z.string().max(200).optional(),
});

export class RawMaterialController {
  async getRawMaterials(req: Request, res: Response): Promise<void> {
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

      const { category, status, lowStock } = req.query;

      const filters: any = {};
      if (category) filters.category = category as string;
      if (status) filters.status = status as RawMaterialStatus;
      if (lowStock === 'true') filters.lowStock = true;

      const rawMaterials = await rawMaterialService.getRawMaterials(restaurantId, filters);
      res.status(200).json({ rawMaterials });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  }

  async getRawMaterialById(req: Request, res: Response): Promise<void> {
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
      const rawMaterial = await rawMaterialService.getRawMaterialById(id, restaurantId);
      if (!rawMaterial) {
        res.status(404).json({ error: 'Raw material not found' });
        return;
      }

      res.status(200).json({ rawMaterial });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  }

  async createRawMaterial(req: Request, res: Response): Promise<void> {
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

      const validationResult = CreateRawMaterialSchema.safeParse(req.body);
      if (!validationResult.success) {
        res.status(400).json({ errors: validationResult.error.flatten().fieldErrors });
        return;
      }

      const data = validationResult.data;
      const payload: any = {
        name: data.name,
        category: data.category,
        sku: data.sku,
        unit: data.unit,
        openingStock: data.openingStock,
        currentStock: data.currentStock,
        minimumStockLevel: data.minimumStockLevel,
        maximumStockLevel: data.maximumStockLevel,
        reorderQuantity: data.reorderQuantity,
        purchasePrice: data.purchasePrice,
        averageCost: data.averageCost,
      };

      if (data.supplierId !== undefined && data.supplierId !== null) payload.supplierId = data.supplierId;
      if (data.expiryDate !== undefined && data.expiryDate !== null) payload.expiryDate = new Date(data.expiryDate);
      if (data.storageLocation !== undefined && data.storageLocation !== null) payload.storageLocation = data.storageLocation;
      if (data.notes !== undefined && data.notes !== null) payload.notes = data.notes;
      if (data.status !== undefined) payload.status = data.status;

      const rawMaterial = await rawMaterialService.createRawMaterial(restaurantId, payload);

      res.status(201).json({ rawMaterial });
    } catch (err: any) {
      res.status(400).json({ error: err.message });
    }
  }

  async updateRawMaterial(req: Request, res: Response): Promise<void> {
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
      const validationResult = UpdateRawMaterialSchema.safeParse(req.body);
      if (!validationResult.success) {
        res.status(400).json({ errors: validationResult.error.flatten().fieldErrors });
        return;
      }

      const data = validationResult.data;
      const payload: any = {};
      
      if (data.name !== undefined) payload.name = data.name;
      if (data.category !== undefined) payload.category = data.category;
      if (data.sku !== undefined) payload.sku = data.sku;
      if (data.unit !== undefined) payload.unit = data.unit;
      if (data.openingStock !== undefined) payload.openingStock = data.openingStock;
      if (data.currentStock !== undefined) payload.currentStock = data.currentStock;
      if (data.minimumStockLevel !== undefined) payload.minimumStockLevel = data.minimumStockLevel;
      if (data.maximumStockLevel !== undefined) payload.maximumStockLevel = data.maximumStockLevel;
      if (data.reorderQuantity !== undefined) payload.reorderQuantity = data.reorderQuantity;
      if (data.purchasePrice !== undefined) payload.purchasePrice = data.purchasePrice;
      if (data.averageCost !== undefined) payload.averageCost = data.averageCost;
      if (data.supplierId !== undefined) payload.supplierId = data.supplierId || null;
      if (data.expiryDate !== undefined) payload.expiryDate = data.expiryDate ? new Date(data.expiryDate) : null;
      if (data.storageLocation !== undefined) payload.storageLocation = data.storageLocation || null;
      if (data.notes !== undefined) payload.notes = data.notes || null;
      if (data.status !== undefined) payload.status = data.status;

      const rawMaterial = await rawMaterialService.updateRawMaterial(id, restaurantId, payload);
      res.status(200).json({ rawMaterial });
    } catch (err: any) {
      res.status(400).json({ error: err.message });
    }
  }

  async adjustStock(req: Request, res: Response): Promise<void> {
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

      const validationResult = AdjustStockSchema.safeParse(req.body);
      if (!validationResult.success) {
        res.status(400).json({ errors: validationResult.error.flatten().fieldErrors });
        return;
      }

      const { rawMaterialId, quantityChange, actionType, reason } = validationResult.data;
      const rawMaterial = await rawMaterialService.adjustStock(
        rawMaterialId,
        restaurantId,
        quantityChange,
        userId,
        actionType,
        reason
      );

      res.status(200).json({ rawMaterial, message: 'Stock adjusted successfully' });
    } catch (err: any) {
      res.status(400).json({ error: err.message });
    }
  }

  async deleteRawMaterial(req: Request, res: Response): Promise<void> {
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
      const rawMaterial = await rawMaterialService.deleteRawMaterial(id, restaurantId);
      res.status(200).json({ rawMaterial, message: 'Raw material status set to INACTIVE successfully' });
    } catch (err: any) {
      res.status(400).json({ error: err.message });
    }
  }
}
