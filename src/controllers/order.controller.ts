import { Request, Response } from 'express';
import { z } from 'zod';
import { OrderService } from '../services/order.service';
import { OrderStatus } from '@prisma/client';

const orderService = new OrderService();

const UpdateStatusSchema = z.object({
  status: z.enum(['NEW', 'PREPARING', 'READY', 'SERVED', 'CANCELLED'], {
    error: 'Invalid status value',
  }),
});

export class OrderController {
  async getOrders(req: Request, res: Response): Promise<void> {
    try {
      if (!req.user) { res.status(401).json({ error: 'Authentication required' }); return; }
      const restaurantId = req.user.restaurantId;
      if (!restaurantId) { res.status(400).json({ error: 'No restaurant linked to this session' }); return; }

      // Parse query filters
      const statusParam = req.query['status'] as string | undefined;
      const dateParam = req.query['date'] as string | undefined;

      const filters: { status?: OrderStatus; date?: Date } = {};
      if (statusParam && Object.values(OrderStatus).includes(statusParam as OrderStatus)) {
        filters.status = statusParam as OrderStatus;
      }
      if (dateParam) {
        const parsedDate = new Date(dateParam);
        if (!isNaN(parsedDate.getTime())) filters.date = parsedDate;
      }

      const orders = await orderService.getOrders(restaurantId, filters);
      res.status(200).json({ orders });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  }

  async getOrderStats(req: Request, res: Response): Promise<void> {
    try {
      if (!req.user) { res.status(401).json({ error: 'Authentication required' }); return; }
      const restaurantId = req.user.restaurantId;
      if (!restaurantId) { res.status(400).json({ error: 'No restaurant linked to this session' }); return; }

      const stats = await orderService.getOrderStats(restaurantId);
      res.status(200).json({ stats });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  }

  async getOrderById(req: Request, res: Response): Promise<void> {
    try {
      if (!req.user) { res.status(401).json({ error: 'Authentication required' }); return; }
      const restaurantId = req.user.restaurantId;
      if (!restaurantId) { res.status(400).json({ error: 'No restaurant linked to this session' }); return; }

      const id = req.params['id'] as string;
      const order = await orderService.getOrderById(id, restaurantId);
      if (!order) { res.status(404).json({ error: 'Order not found' }); return; }

      res.status(200).json({ order });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  }

  async updateOrderStatus(req: Request, res: Response): Promise<void> {
    try {
      if (!req.user) { res.status(401).json({ error: 'Authentication required' }); return; }
      const restaurantId = req.user.restaurantId;
      if (!restaurantId) { res.status(400).json({ error: 'No restaurant linked to this session' }); return; }

      const id = req.params['id'] as string;
      const validationResult = UpdateStatusSchema.safeParse(req.body);
      if (!validationResult.success) {
        res.status(400).json({ errors: validationResult.error.flatten().fieldErrors });
        return;
      }

      const order = await orderService.updateOrderStatus(
        id,
        restaurantId,
        validationResult.data.status as OrderStatus
      );
      res.status(200).json({ order });
    } catch (err: any) {
      res.status(400).json({ error: err.message });
    }
  }
}
