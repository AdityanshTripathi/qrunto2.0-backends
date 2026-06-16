import { Request, Response } from 'express';
import { prisma } from '../lib/prisma';

export class NotificationController {
  async getNotifications(req: Request, res: Response): Promise<void> {
    try {
      if (!req.user) {
        res.status(401).json({ error: 'Authentication required' });
        return;
      }

      const isSuperAdmin = req.user.role === 'SUPER_ADMIN';
      const restaurantId = req.user.restaurantId;

      if (!isSuperAdmin && !restaurantId) {
        res.status(400).json({ error: 'No restaurant associated with this session' });
        return;
      }

      const notifications = await prisma.notification.findMany({
        where: isSuperAdmin
          ? { restaurantId: null }
          : { restaurantId: restaurantId as string },
        orderBy: {
          createdAt: 'desc',
        },
        take: 50, // Limit to recent 50 notifications
      });

      res.status(200).json({ notifications });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  }

  async markAsRead(req: Request, res: Response): Promise<void> {
    try {
      if (!req.user) {
        res.status(401).json({ error: 'Authentication required' });
        return;
      }

      const id = req.params['id'] as string;
      if (!id) {
        res.status(400).json({ error: 'Notification ID is required' });
        return;
      }

      const isSuperAdmin = req.user.role === 'SUPER_ADMIN';
      const restaurantId = req.user.restaurantId;

      // Find the notification
      const notification = await prisma.notification.findUnique({
        where: { id },
      });

      if (!notification) {
        res.status(404).json({ error: 'Notification not found' });
        return;
      }

      // Check permissions
      if (isSuperAdmin) {
        if (notification.restaurantId !== null) {
          res.status(403).json({ error: 'Access denied' });
          return;
        }
      } else {
        if (notification.restaurantId !== restaurantId) {
          res.status(403).json({ error: 'Access denied' });
          return;
        }
      }

      // Update isRead to true
      const updated = await prisma.notification.update({
        where: { id },
        data: { isRead: true },
      });

      res.status(200).json({ notification: updated });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  }

  async markAllAsRead(req: Request, res: Response): Promise<void> {
    try {
      if (!req.user) {
        res.status(401).json({ error: 'Authentication required' });
        return;
      }

      const isSuperAdmin = req.user.role === 'SUPER_ADMIN';
      const restaurantId = req.user.restaurantId;

      if (!isSuperAdmin && !restaurantId) {
        res.status(400).json({ error: 'No restaurant associated with this session' });
        return;
      }

      // Update all unread notifications
      await prisma.notification.updateMany({
        where: isSuperAdmin
          ? { restaurantId: null, isRead: false }
          : { restaurantId: restaurantId as string, isRead: false },
        data: { isRead: true },
      });

      res.status(200).json({ message: 'All notifications marked as read successfully' });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  }
}
