import { Request, Response } from 'express';
import { z } from 'zod';
import bcrypt from 'bcrypt';
import { prisma } from '../lib/prisma';

// Zod schemas
const CreateWaiterSchema = z.object({
  name: z.string().min(2, 'Name must be at least 2 characters').max(50),
  phone: z.string().min(10, 'Phone number must be at least 10 digits').max(15),
  email: z.string().email('Invalid email address'),
  password: z.string().min(6, 'Password must be at least 6 characters'),
  status: z.enum(['Active', 'Disabled']).default('Active'),
});

const UpdateWaiterSchema = z.object({
  name: z.string().min(2, 'Name must be at least 2 characters').max(50),
  phone: z.string().min(10, 'Phone number must be at least 10 digits').max(15),
  email: z.string().email('Invalid email address'),
  status: z.enum(['Active', 'Disabled']),
});

const ResetPasswordSchema = z.object({
  password: z.string().min(6, 'Password must be at least 6 characters'),
});

export class WaiterController {
  // GET /api/dashboard/waiters - View All Waiters
  async list(req: Request, res: Response): Promise<void> {
    try {
      if (!req.user || !req.user.restaurantId) {
        res.status(400).json({ error: 'Restaurant ID is required' });
        return;
      }

      const waiters = await prisma.waiter.findMany({
        where: { restaurantId: req.user.restaurantId },
        orderBy: { createdAt: 'desc' },
        select: {
          id: true,
          name: true,
          email: true,
          phone: true,
          isActive: true,
          createdAt: true,
        },
      });

      res.status(200).json({ waiters });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  }

  // POST /api/dashboard/waiters - Create Waiter
  async create(req: Request, res: Response): Promise<void> {
    try {
      if (!req.user || !req.user.restaurantId) {
        res.status(400).json({ error: 'Restaurant ID is required' });
        return;
      }

      // Validate input
      const validationResult = CreateWaiterSchema.safeParse(req.body);
      if (!validationResult.success) {
        res.status(400).json({ errors: validationResult.error.flatten().fieldErrors });
        return;
      }

      const { name, email, phone, password, status } = validationResult.data;

      // Check if email already exists in User or Waiter table
      const existingUser = await prisma.user.findUnique({ where: { email } });
      const existingWaiter = await prisma.waiter.findUnique({ where: { email } });
      if (existingUser || existingWaiter) {
        res.status(400).json({ error: 'Email is already in use' });
        return;
      }

      // Hash password
      const passwordHash = await bcrypt.hash(password, 10);

      // Create waiter record
      const waiter = await prisma.waiter.create({
        data: {
          restaurantId: req.user.restaurantId,
          name,
          email,
          phone,
          passwordHash,
          isActive: status === 'Active',
        },
        select: {
          id: true,
          name: true,
          email: true,
          phone: true,
          isActive: true,
          createdAt: true,
        },
      });

      res.status(201).json({ message: 'Waiter created successfully!', waiter });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  }

  // PUT /api/dashboard/waiters/:id - Edit Waiter
  async update(req: Request, res: Response): Promise<void> {
    try {
      if (!req.user || !req.user.restaurantId) {
        res.status(400).json({ error: 'Restaurant ID is required' });
        return;
      }

      const id = req.params.id as string;

      // Validate input
      const validationResult = UpdateWaiterSchema.safeParse(req.body);
      if (!validationResult.success) {
        res.status(400).json({ errors: validationResult.error.flatten().fieldErrors });
        return;
      }

      const { name, email, phone, status } = validationResult.data;

      // Find waiter
      const waiter = await prisma.waiter.findFirst({
        where: { id, restaurantId: req.user.restaurantId },
      });

      if (!waiter) {
        res.status(404).json({ error: 'Waiter not found' });
        return;
      }

      // Check if email already exists in User or Waiter (excluding self)
      const existingUser = await prisma.user.findUnique({ where: { email } });
      const existingWaiter = await prisma.waiter.findFirst({
        where: { email, NOT: { id } },
      });
      if (existingUser || existingWaiter) {
        res.status(400).json({ error: 'Email is already in use' });
        return;
      }

      // Update waiter record
      const updatedWaiter = await prisma.waiter.update({
        where: { id },
        data: {
          name,
          email,
          phone,
          isActive: status === 'Active',
        },
        select: {
          id: true,
          name: true,
          email: true,
          phone: true,
          isActive: true,
          createdAt: true,
        },
      });

      res.status(200).json({ message: 'Waiter updated successfully!', waiter: updatedWaiter });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  }

  // DELETE /api/dashboard/waiters/:id - Delete Waiter
  async delete(req: Request, res: Response): Promise<void> {
    try {
      if (!req.user || !req.user.restaurantId) {
        res.status(400).json({ error: 'Restaurant ID is required' });
        return;
      }

      const id = req.params.id as string;

      const waiter = await prisma.waiter.findFirst({
        where: { id, restaurantId: req.user.restaurantId },
      });

      if (!waiter) {
        res.status(404).json({ error: 'Waiter not found' });
        return;
      }

      await prisma.waiter.delete({
        where: { id },
      });

      res.status(200).json({ message: 'Waiter deleted successfully!' });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  }

  // PATCH /api/dashboard/waiters/:id/status - Toggle Waiter Status (Enable/Disable)
  async toggleStatus(req: Request, res: Response): Promise<void> {
    try {
      if (!req.user || !req.user.restaurantId) {
        res.status(400).json({ error: 'Restaurant ID is required' });
        return;
      }

      const id = req.params.id as string;
      const { isActive } = req.body;

      const waiter = await prisma.waiter.findFirst({
        where: { id, restaurantId: req.user.restaurantId },
      });

      if (!waiter) {
        res.status(404).json({ error: 'Waiter not found' });
        return;
      }

      const updatedWaiter = await prisma.waiter.update({
        where: { id },
        data: {
          isActive: Boolean(isActive),
        },
      });

      res.status(200).json({
        message: `Waiter ${updatedWaiter.isActive ? 'enabled' : 'disabled'} successfully!`,
        waiter: {
          id: updatedWaiter.id,
          isActive: updatedWaiter.isActive,
        },
      });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  }

  // POST /api/dashboard/waiters/:id/reset-password - Reset Password
  async resetPassword(req: Request, res: Response): Promise<void> {
    try {
      if (!req.user || !req.user.restaurantId) {
        res.status(400).json({ error: 'Restaurant ID is required' });
        return;
      }

      const id = req.params.id as string;

      const validationResult = ResetPasswordSchema.safeParse(req.body);
      if (!validationResult.success) {
        res.status(400).json({ errors: validationResult.error.flatten().fieldErrors });
        return;
      }

      const { password } = validationResult.data;

      const waiter = await prisma.waiter.findFirst({
        where: { id, restaurantId: req.user.restaurantId },
      });

      if (!waiter) {
        res.status(404).json({ error: 'Waiter not found' });
        return;
      }

      // Hash password
      const passwordHash = await bcrypt.hash(password, 10);

      await prisma.waiter.update({
        where: { id },
        data: {
          passwordHash,
        },
      });

      res.status(200).json({ message: 'Waiter password reset successfully!' });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  }
}
