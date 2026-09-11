import { Response } from 'express';
import { AuthenticatedRequest } from '../../middlewares/auth.middleware';
import { CustomerRepository } from '../../repositories/crm/customer.repository';
import { TimelineService } from '../../services/crm/timeline.service';
import { prisma } from '../../lib/prisma';
import { z } from 'zod';
import { OccasionService } from '../../services/crm/occasion.service';

const occasionService = new OccasionService();

const customerRepository = new CustomerRepository();

const CustomerUpdateSchema = z.object({
  name: z.string().min(1, 'Name is required').max(100).optional(),
  email: z.string().email('Invalid email address').or(z.literal('')).nullable().optional(),
  phone: z.string().max(15).optional(),
  metadataJson: z.any().optional(),
});

export class CustomerController {
  // Fetch all customers for a Brand with pagination/filters
  async getCustomers(req: AuthenticatedRequest, res: Response): Promise<void> {
    try {
      const user = req.user;
      if (!user) {
        res.status(401).json({ error: 'Unauthorized' });
        return;
      }

      // 1. Get Brand of the owner's restaurants
      const ownerRecord = await prisma.user.findUnique({
        where: { id: user.id },
        include: {
          restaurants: {
            select: { brandId: true }
          }
        }
      });

      const brandId = ownerRecord?.restaurants?.[0]?.brandId;
      if (!brandId) {
        res.status(400).json({ error: 'No brand context found for this account' });
        return;
      }

      // Extract filter parameters
      const search = req.query['search'] as string;
      const restaurantId = req.query['restaurantId'] as string;

      if (restaurantId) {
        const requestedRestaurant = await prisma.restaurant.findFirst({
          where: {
            id: restaurantId,
            brandId,
            isActive: true,
          },
          select: { id: true },
        });

        if (!requestedRestaurant) {
          res.status(403).json({ error: 'Restaurant is outside the authorized business context' });
          return;
        }
      }
      const requestedLimit = req.query['limit'] === undefined ? 20 : Number(req.query['limit']);
      const requestedOffset = req.query['offset'] === undefined ? 0 : Number(req.query['offset']);
      if (!Number.isInteger(requestedLimit) || requestedLimit < 1 ||
          !Number.isInteger(requestedOffset) || requestedOffset < 0) {
        res.status(400).json({ error: 'Invalid pagination parameters' });
        return;
      }
      const limit = Math.min(requestedLimit, 100);
      const offset = requestedOffset;
      const sortBy = req.query['sortBy'] as string;
      const sortOrder = req.query['sortOrder'] as 'asc' | 'desc';

      const [customers, total] = await Promise.all([
        customerRepository.findMany(brandId, {
          search, restaurantId, limit, offset, sortBy, sortOrder,
        }),
        customerRepository.count(brandId, { search, restaurantId }),
      ]);

      res.status(200).json({ customers, total });
    } catch (err: any) {
      res.status(500).json({ error: 'Internal server error' });
    }
  }

  // Fetch individual customer profile metrics & notes
  async getCustomerById(req: AuthenticatedRequest, res: Response): Promise<void> {
    try {
      const user = req.user;
      const customerId = req.params['id'] as string;
      if (!user || !customerId) {
        res.status(400).json({ error: 'Invalid request parameters' });
        return;
      }

      const ownerRecord = await prisma.user.findUnique({
        where: { id: user.id },
        include: {
          restaurants: {
            select: { brandId: true }
          }
        }
      });

      const brandId = ownerRecord?.restaurants?.[0]?.brandId;
      if (!brandId) {
        res.status(400).json({ error: 'No brand context found' });
        return;
      }

      const customer = await customerRepository.findById(customerId, brandId);
      if (!customer) {
        res.status(404).json({ error: 'Customer not found' });
        return;
      }

      res.status(200).json({ customer });
    } catch (err: any) {
      res.status(500).json({ error: 'Internal server error' });
    }
  }

  // Update customer fields
  async updateCustomer(req: AuthenticatedRequest, res: Response): Promise<void> {
    try {
      const user = req.user;
      const customerId = req.params['id'] as string;
      if (!user || !customerId) {
        res.status(400).json({ error: 'Invalid request parameters' });
        return;
      }

      const validationResult = CustomerUpdateSchema.safeParse(req.body);
      if (!validationResult.success) {
        res.status(400).json({ errors: validationResult.error.flatten().fieldErrors });
        return;
      }

      const ownerRecord = await prisma.user.findUnique({
        where: { id: user.id },
        include: {
          restaurants: {
            select: { brandId: true }
          }
        }
      });

      const brandId = ownerRecord?.restaurants?.[0]?.brandId;
      if (!brandId) {
        res.status(400).json({ error: 'No brand context found' });
        return;
      }

      // Sanitize null values
      const updateData: any = {};
      if (validationResult.data.name !== undefined) updateData.name = validationResult.data.name;
      if (validationResult.data.phone !== undefined) updateData.phone = validationResult.data.phone;
      if (validationResult.data.metadataJson !== undefined) updateData.metadataJson = validationResult.data.metadataJson;
      if (validationResult.data.email !== undefined) {
        updateData.email = validationResult.data.email === '' ? null : validationResult.data.email;
      }

      const updated = await customerRepository.update(customerId, brandId, updateData);
      res.status(200).json({ message: 'Customer updated successfully', customer: updated });
    } catch (err: any) {
      res.status(500).json({ error: 'Internal server error' });
    }
  }

  // Fetch customer timeline
  async getCustomerTimeline(req: AuthenticatedRequest, res: Response): Promise<void> {
    try {
      const user = req.user;
      const customerId = req.params['id'] as string;
      if (!user || !customerId) {
        res.status(400).json({ error: 'Invalid request parameters' });
        return;
      }

      const ownerRecord = await prisma.user.findUnique({
        where: { id: user.id },
        include: {
          restaurants: {
            select: { brandId: true }
          }
        }
      });

      const brandId = ownerRecord?.restaurants?.[0]?.brandId;
      if (!brandId) {
        res.status(400).json({ error: 'No brand context found' });
        return;
      }

      const timelineService = new TimelineService();
      const timeline = await timelineService.getCustomerTimeline(customerId, brandId);
      res.status(200).json({ timeline });
    } catch (err: any) {
      res.status(500).json({ error: 'Internal server error' });
    }
  }

  // Create customer note
  async createCustomerNote(req: AuthenticatedRequest, res: Response): Promise<void> {
    try {
      const user = req.user;
      const customerId = req.params['id'] as string;
      const { noteText } = req.body;

      if (!user || !customerId || !noteText || noteText.trim() === '') {
        res.status(400).json({ error: 'Invalid request parameters' });
        return;
      }

      // Check brand mapping
      const ownerRecord = await prisma.user.findUnique({
        where: { id: user.id },
        include: {
          restaurants: {
            select: { brandId: true }
          }
        }
      });

      const brandId = ownerRecord?.restaurants?.[0]?.brandId;
      if (!brandId) {
        res.status(400).json({ error: 'No brand context found' });
        return;
      }

      // Check customer belongs to brand
      const customer = await prisma.customer.findFirst({
        where: { id: customerId, brandId },
      });

      if (!customer) {
        res.status(404).json({ error: 'Customer not found or unauthorized' });
        return;
      }

      // Create Note
      const note = await prisma.customerNote.create({
        data: {
          customerId,
          userId: user.id,
          noteText: noteText.trim(),
          isSystem: false,
        },
        include: {
          user: {
            select: { name: true }
          }
        }
      });

      res.status(201).json({ message: 'Note added successfully', note });
    } catch (err: any) {
      res.status(500).json({ error: 'Internal server error' });
    }
  }

  // Fetch upcoming birthdays/anniversaries (next 30 days)
  async getUpcomingOccasions(req: AuthenticatedRequest, res: Response): Promise<void> {
    try {
      const user = req.user;
      if (!user) {
        res.status(401).json({ error: 'Unauthorized' });
        return;
      }

      const ownerRecord = await prisma.user.findUnique({
        where: { id: user.id },
        include: { restaurants: { select: { brandId: true } } }
      });

      const brandId = ownerRecord?.restaurants?.[0]?.brandId;
      if (!brandId) {
        res.status(400).json({ error: 'No brand context found' });
        return;
      }

      const upcoming = await occasionService.getUpcomingOccasions(brandId);
      res.status(200).json({ upcoming });
    } catch (err: any) {
      res.status(500).json({ error: 'Internal server error' });
    }
  }
}
