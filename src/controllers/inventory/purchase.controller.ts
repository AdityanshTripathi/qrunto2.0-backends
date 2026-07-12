import { Request, Response } from 'express';
import { z } from 'zod';
import { PurchaseService } from '../../services/inventory/purchase.service';
import { PurchaseOrderStatus } from '@prisma/client';

const purchaseService = new PurchaseService();

const CreatePurchaseOrderItemSchema = z.object({
  rawMaterialId: z.string().uuid('Invalid raw material ID'),
  quantity: z.number().positive('Quantity must be greater than 0'),
  unitPrice: z.number().nonnegative('Unit price cannot be negative'),
  gstPercentage: z.number().nonnegative().optional(),
  totalCost: z.number().nonnegative(),
  expiryDate: z.string().datetime().optional().nullable(),
});

const CreatePurchaseOrderSchema = z.object({
  supplierId: z.string().uuid('Invalid supplier ID'),
  poNumber: z.string().min(1, 'PO number is required'),
  status: z.nativeEnum(PurchaseOrderStatus).optional(),
  orderDate: z.string().datetime().optional(),
  expectedDate: z.string().datetime().optional().nullable(),
  subtotal: z.number().nonnegative(),
  gstAmount: z.number().nonnegative(),
  grandTotal: z.number().nonnegative(),
  notes: z.string().max(1000).optional().nullable(),
  items: z.array(CreatePurchaseOrderItemSchema).min(1, 'At least one item is required'),
});

const UpdatePurchaseOrderSchema = CreatePurchaseOrderSchema.partial();

const ReceivePurchaseOrderSchema = z.object({
  receivedDate: z.string().datetime().optional(),
  invoiceNumber: z.string().max(100).optional().nullable(),
  invoiceAttachmentUrl: z.string().url().or(z.literal('')).optional().nullable(),
  notes: z.string().max(1000).optional().nullable(),
});

export class PurchaseController {
  async getPurchaseOrders(req: Request, res: Response): Promise<void> {
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

      const purchaseOrders = await purchaseService.getPurchaseOrders(restaurantId);
      res.status(200).json({ purchaseOrders });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  }

  async getPurchaseOrderById(req: Request, res: Response): Promise<void> {
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
      const purchaseOrder = await purchaseService.getPurchaseOrderById(id, restaurantId);
      if (!purchaseOrder) {
        res.status(404).json({ error: 'Purchase order not found' });
        return;
      }

      res.status(200).json({ purchaseOrder });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  }

  async createPurchaseOrder(req: Request, res: Response): Promise<void> {
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

      const validationResult = CreatePurchaseOrderSchema.safeParse(req.body);
      if (!validationResult.success) {
        res.status(400).json({ errors: validationResult.error.flatten().fieldErrors });
        return;
      }

      const data = validationResult.data;
      const payload: any = {
        supplierId: data.supplierId,
        poNumber: data.poNumber,
        subtotal: data.subtotal,
        gstAmount: data.gstAmount,
        grandTotal: data.grandTotal,
        items: data.items.map(item => {
          const itemPayload: any = {
            rawMaterialId: item.rawMaterialId,
            quantity: item.quantity,
            unitPrice: item.unitPrice,
            totalCost: item.totalCost,
          };
          if (item.gstPercentage !== undefined) itemPayload.gstPercentage = item.gstPercentage;
          if (item.expiryDate !== undefined && item.expiryDate !== null) itemPayload.expiryDate = new Date(item.expiryDate);
          return itemPayload;
        }),
      };
      if (data.status !== undefined) payload.status = data.status;
      if (data.orderDate !== undefined) payload.orderDate = new Date(data.orderDate);
      if (data.expectedDate !== undefined && data.expectedDate !== null) payload.expectedDate = new Date(data.expectedDate);
      if (data.notes !== undefined && data.notes !== null) payload.notes = data.notes;

      const purchaseOrder = await purchaseService.createPurchaseOrder(restaurantId, payload);
      res.status(201).json({ purchaseOrder });
    } catch (err: any) {
      res.status(400).json({ error: err.message });
    }
  }

  async updatePurchaseOrder(req: Request, res: Response): Promise<void> {
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
      const validationResult = UpdatePurchaseOrderSchema.safeParse(req.body);
      if (!validationResult.success) {
        res.status(400).json({ errors: validationResult.error.flatten().fieldErrors });
        return;
      }

      const data = validationResult.data;
      const payload: any = {};
      if (data.supplierId !== undefined) payload.supplierId = data.supplierId;
      if (data.poNumber !== undefined) payload.poNumber = data.poNumber;
      if (data.status !== undefined) payload.status = data.status;
      if (data.subtotal !== undefined) payload.subtotal = data.subtotal;
      if (data.gstAmount !== undefined) payload.gstAmount = data.gstAmount;
      if (data.grandTotal !== undefined) payload.grandTotal = data.grandTotal;
      if (data.orderDate !== undefined) payload.orderDate = data.orderDate ? new Date(data.orderDate) : undefined;
      if (data.expectedDate !== undefined) payload.expectedDate = data.expectedDate ? new Date(data.expectedDate) : null;
      if (data.notes !== undefined) payload.notes = data.notes || null;
      if (data.items !== undefined) {
        payload.items = data.items.map(item => {
          const itemPayload: any = {
            rawMaterialId: item.rawMaterialId,
            quantity: item.quantity,
            unitPrice: item.unitPrice,
            totalCost: item.totalCost,
          };
          if (item.gstPercentage !== undefined) itemPayload.gstPercentage = item.gstPercentage;
          if (item.expiryDate !== undefined) itemPayload.expiryDate = item.expiryDate ? new Date(item.expiryDate) : null;
          return itemPayload;
        });
      }

      const purchaseOrder = await purchaseService.updatePurchaseOrder(id, restaurantId, payload);
      res.status(200).json({ purchaseOrder });
    } catch (err: any) {
      res.status(400).json({ error: err.message });
    }
  }

  async receivePurchaseOrder(req: Request, res: Response): Promise<void> {
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
      const validationResult = ReceivePurchaseOrderSchema.safeParse(req.body);
      if (!validationResult.success) {
        res.status(400).json({ errors: validationResult.error.flatten().fieldErrors });
        return;
      }

      const data = validationResult.data;
      const payload: any = {
        receivedDate: data.receivedDate ? new Date(data.receivedDate) : new Date(),
      };
      if (data.invoiceNumber !== undefined && data.invoiceNumber !== null) payload.invoiceNumber = data.invoiceNumber;
      if (data.invoiceAttachmentUrl !== undefined && data.invoiceAttachmentUrl !== null) payload.invoiceAttachmentUrl = data.invoiceAttachmentUrl;
      if (data.notes !== undefined && data.notes !== null) payload.notes = data.notes;

      const purchaseOrder = await purchaseService.receivePurchaseOrder(id, restaurantId, payload);
      res.status(200).json({ purchaseOrder, message: 'Purchase order received and stock levels updated successfully' });
    } catch (err: any) {
      res.status(400).json({ error: err.message });
    }
  }
}
