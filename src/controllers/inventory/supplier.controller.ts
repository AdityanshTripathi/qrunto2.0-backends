import { Request, Response } from 'express';
import { z } from 'zod';
import { SupplierService } from '../../services/inventory/supplier.service';

const supplierService = new SupplierService();

const CreateSupplierSchema = z.object({
  name: z.string().min(1, 'Supplier name is required').max(100),
  contactName: z.string().max(100).optional(),
  phone: z.string().min(5, 'Phone number is required').max(20),
  email: z.string().email('Invalid email address').or(z.literal('')).optional(),
  gstNumber: z.string().max(20).optional(),
  address: z.string().max(500).optional(),
  creditDays: z.number().int().nonnegative().optional(),
  outstandingBalance: z.number().optional(),
  isActive: z.boolean().optional(),
});

const UpdateSupplierSchema = CreateSupplierSchema.partial();

export class SupplierController {
  async getSuppliers(req: Request, res: Response): Promise<void> {
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

      const suppliers = await supplierService.getSuppliers(restaurantId);
      res.status(200).json({ suppliers });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  }

  async getSupplierById(req: Request, res: Response): Promise<void> {
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
      const supplier = await supplierService.getSupplierById(id, restaurantId);
      if (!supplier) {
        res.status(404).json({ error: 'Supplier not found' });
        return;
      }

      res.status(200).json({ supplier });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  }

  async createSupplier(req: Request, res: Response): Promise<void> {
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

      const validationResult = CreateSupplierSchema.safeParse(req.body);
      if (!validationResult.success) {
        res.status(400).json({ errors: validationResult.error.flatten().fieldErrors });
        return;
      }

      const data = validationResult.data;
      const payload: any = {
        name: data.name,
        phone: data.phone,
      };
      if (data.contactName !== undefined) payload.contactName = data.contactName;
      if (data.email !== undefined) payload.email = data.email || null;
      if (data.gstNumber !== undefined) payload.gstNumber = data.gstNumber;
      if (data.address !== undefined) payload.address = data.address;
      if (data.creditDays !== undefined) payload.creditDays = data.creditDays;
      if (data.outstandingBalance !== undefined) payload.outstandingBalance = data.outstandingBalance;
      if (data.isActive !== undefined) payload.isActive = data.isActive;

      const supplier = await supplierService.createSupplier(restaurantId, payload);
      res.status(201).json({ supplier });
    } catch (err: any) {
      res.status(400).json({ error: err.message });
    }
  }

  async updateSupplier(req: Request, res: Response): Promise<void> {
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
      const validationResult = UpdateSupplierSchema.safeParse(req.body);
      if (!validationResult.success) {
        res.status(400).json({ errors: validationResult.error.flatten().fieldErrors });
        return;
      }

      const data = validationResult.data;
      const payload: any = {};
      if (data.name !== undefined) payload.name = data.name;
      if (data.contactName !== undefined) payload.contactName = data.contactName;
      if (data.phone !== undefined) payload.phone = data.phone;
      if (data.email !== undefined) payload.email = data.email || null;
      if (data.gstNumber !== undefined) payload.gstNumber = data.gstNumber;
      if (data.address !== undefined) payload.address = data.address;
      if (data.creditDays !== undefined) payload.creditDays = data.creditDays;
      if (data.outstandingBalance !== undefined) payload.outstandingBalance = data.outstandingBalance;
      if (data.isActive !== undefined) payload.isActive = data.isActive;

      const supplier = await supplierService.updateSupplier(id, restaurantId, payload);
      res.status(200).json({ supplier });
    } catch (err: any) {
      res.status(400).json({ error: err.message });
    }
  }

  async deleteSupplier(req: Request, res: Response): Promise<void> {
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
      const supplier = await supplierService.deleteSupplier(id, restaurantId);
      res.status(200).json({ supplier, message: 'Supplier deactivated successfully' });
    } catch (err: any) {
      res.status(400).json({ error: err.message });
    }
  }
}
