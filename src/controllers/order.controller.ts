import { restaurantTimezone, dateInput, validDate, localDate, BusinessDateError } from '../lib/timezone';
import { Request, Response } from 'express';
import { moneyNumber } from '../lib/money';
import { z } from 'zod';
import { OrderService } from '../services/order.service';
import { OrderStatus } from '@prisma/client';
import { logSafeError, safeError } from '../lib/safe-error';

const orderService = new OrderService();

const UpdateStatusSchema = z.object({
  status: z.enum(['NEW', 'ACCEPTED', 'PREPARING', 'READY', 'SERVED', 'CANCELLED'], {
    error: 'Invalid status value',
  }),
});

export class OrderController {
  async getOrders(req: Request, res: Response): Promise<void> {
    try {
      if (!req.user) { res.status(401).json({ error: 'Authentication required' }); return; }
      const restaurantId = req.user.restaurantId;
      if (!restaurantId) { res.status(400).json({ error: 'No restaurant linked to this session' }); return; }

      const statusParam = req.query['status'] as string | undefined;
      const dateParam = req.query['date'] as string | undefined;
      const startDateParam = req.query['startDate'] as string | undefined;
      const endDateParam = req.query['endDate'] as string | undefined;
      const cursor = req.query['cursor'] as string | undefined;
      const requestedLimit = Number(req.query['limit']);
      const limit = Number.isInteger(requestedLimit) && requestedLimit > 0
        ? Math.min(requestedLimit, 100)
        : 30;

      const filters: { status?: OrderStatus; date?: Date; startDate?: Date; endDate?: Date } = {};
      if (statusParam && Object.values(OrderStatus).includes(statusParam as OrderStatus)) {
        filters.status = statusParam as OrderStatus;
      }

      const zone = (dateParam || startDateParam || endDateParam) ? await restaurantTimezone(restaurantId) : 'UTC';
      const addValidDate = (value: string | undefined, key: 'date' | 'startDate' | 'endDate') => {
        if (!value) return;
        const parsed = key === 'date'
          ? new Date((/^\d{4}-\d{2}-\d{2}$/.test(value) ? validDate(value) : localDate(dateInput(value, zone), zone)) + 'T00:00:00Z')
          : dateInput(value, zone, key === 'endDate');
        if (!isNaN(parsed.getTime())) filters[key] = parsed;
      };
      addValidDate(dateParam, 'date');
      addValidDate(startDateParam, 'startDate');
      addValidDate(endDateParam, 'endDate');

      if (cursor && !z.string().uuid().safeParse(cursor).success) {
        res.status(400).json({ error: 'Invalid pagination cursor' });
        return;
      }

      const result = await orderService.getOrders(
        restaurantId,
        filters,
        cursor ? { cursor, limit } : { limit },
      );
      res.status(200).json(result);
    } catch (err: any) {
      if (err instanceof BusinessDateError) { res.status(400).json({ error: err.message }); return; }
      res.status(500).json({ error: 'Internal server error' });
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
      res.status(500).json({ error: 'Internal server error' });
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
      res.status(500).json({ error: 'Internal server error' });
    }
  }

  async getInvoice(req: Request, res: Response): Promise<void> {
    try {
      if (!req.user) {
        res.status(401).json({ error: 'Authentication required' });
        return;
      }

      const restaurantId = req.user.restaurantId;
      if (!restaurantId) {
        res.status(400).json({ error: 'No restaurant linked to this session' });
        return;
      }

      const id = req.params['id'] as string;
      const invoice = await orderService.getInvoice(id, restaurantId);

      if (!invoice) {
        res.status(404).json({ error: 'Invoice not found' });
        return;
      }

      res.status(200).json({ invoice });
    } catch {
      res.status(500).json({ error: 'Internal server error' });
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

      const io = req.app.get('io');
      if (io) {
        io.to(restaurantId).emit('ORDER_UPDATED', {
          orderId: order.id,
          orderNumber: order.orderNumber,
          status: order.status,
          tableNumber: order.table.tableNumber,
          totalAmount: moneyNumber(order.totalAmount),
        });

        if (order.status === 'READY') {
          io.to(restaurantId).emit('ORDER_READY', {
            orderId: order.id,
            orderNumber: order.orderNumber,
            tableNumber: order.table.tableNumber,
          });
        }
      }

      res.status(200).json({ order });
    } catch (err: any) {
      res.status(400).json({ error: err.message });
    }
  }

  async applyLoyaltyDiscount(req: Request, res: Response): Promise<void> {
    try {
      if (!req.user) { res.status(401).json({ error: 'Authentication required' }); return; }
      const restaurantId = req.user.restaurantId;
      if (!restaurantId) { res.status(400).json({ error: 'No restaurant linked to this session' }); return; }

      const id = req.params['id'] as string;
      const { pointsToRedeem } = req.body;

      if (typeof pointsToRedeem !== 'number' || pointsToRedeem <= 0) {
        res.status(400).json({ error: 'Invalid pointsToRedeem value' });
        return;
      }

      const order = await orderService.applyLoyaltyDiscount(
        id,
        restaurantId,
        pointsToRedeem
      );

      res.status(200).json({ order });
    } catch (err: any) {
      res.status(400).json({ error: err.message });
    }
  }

  async payOrder(req: Request, res: Response): Promise<void> {
    try {
      if (!req.user) { res.status(401).json({ error: 'Authentication required' }); return; }
      const restaurantId = req.user.restaurantId;
      if (!restaurantId) { res.status(400).json({ error: 'No restaurant linked to this session' }); return; }

      const id = req.params['id'] as string;
      const { paymentMethod } = req.body;

      const order = await orderService.payOrder(
        id,
        restaurantId,
        paymentMethod
      );

      const io = req.app.get('io');
      if (io) {
        io.to(restaurantId).emit('ORDER_UPDATED', {
          orderId: order.id,
          orderNumber: order.orderNumber,
          status: order.status,
          tableNumber: order.table.tableNumber,
          totalAmount: moneyNumber(order.totalAmount),
        });
      }

      res.status(200).json({ order });
    } catch (err: any) {
      const safe = safeError(err);
      if (safe.code !== 'UNKNOWN') {
        logSafeError('order.pay', err, 'payments');
        res.status(503).json({ error: safe.message });
        return;
      }
      const message = err instanceof Error && /^(Only cash|Order not found|Cannot settle|Invalid order amount|Payment reconciliation|Refunded payment|Order changed)/.test(err.message)
        ? err.message : 'Unable to settle order';
      if (message === 'Unable to settle order') logSafeError('order.pay', err, 'payments');
      res.status(400).json({ error: message });
    }
  }
}
