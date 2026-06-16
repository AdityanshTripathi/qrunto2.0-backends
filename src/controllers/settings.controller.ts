import { Request, Response } from 'express';
import { z } from 'zod';
import { prisma } from '../lib/prisma';

// ─── Zod Schema for Settings Update ──────────────────────────────────────────
const UpdateSettingsSchema = z.object({
  // Restaurant Profile Details
  name: z.string().min(2, 'Restaurant name must be at least 2 characters').optional(),
  phone: z.string().nullable().optional(),
  email: z.string().email('Invalid email address').nullable().optional(),
  address: z.string().nullable().optional(),
  gstNumber: z.string().nullable().optional(),
  logoUrl: z.string().nullable().optional(),

  // Restaurant Settings
  currency: z.string().min(1, 'Currency is required').optional(),
  taxPercentage: z.number().min(0, 'Tax percentage cannot be negative').max(100, 'Tax percentage cannot exceed 100').optional(),
  businessHours: z.any().optional(),
  themeSettings: z.any().optional(),
});


export class SettingsController {
  // ─── GET /api/settings ──────────────────────────────────────────────────────
  async getSettings(req: Request, res: Response): Promise<void> {
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

      // Fetch restaurant with settings
      let restaurant = await prisma.restaurant.findUnique({
        where: { id: restaurantId },
        include: { settings: true },
      });

      if (!restaurant) {
        res.status(404).json({ error: 'Restaurant not found' });
        return;
      }

      // Auto-create settings if not found
      if (!restaurant.settings) {
        const createdSettings = await prisma.restaurantSetting.create({
          data: {
            restaurantId: restaurant.id,
            currency: 'INR',
            taxPercentage: 0,
          },
        });
        restaurant.settings = createdSettings;
      }

      res.status(200).json({
        restaurant: {
          id: restaurant.id,
          name: restaurant.name,
          slug: restaurant.slug,
          logoUrl: restaurant.logoUrl,
          phone: restaurant.phone,
          email: restaurant.email,
          address: restaurant.address,
          gstNumber: restaurant.gstNumber,
        },
        settings: restaurant.settings,
      });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  }

  // ─── PATCH /api/settings ────────────────────────────────────────────────────
  async updateSettings(req: Request, res: Response): Promise<void> {
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

      // Validate input
      const validationResult = UpdateSettingsSchema.safeParse(req.body);
      if (!validationResult.success) {
        res.status(400).json({ errors: validationResult.error.flatten().fieldErrors });
        return;
      }

      const data = validationResult.data;

      // Split restaurant fields and settings fields
      const restaurantFields: Record<string, any> = {};
      if (data.name !== undefined) restaurantFields.name = data.name;
      if (data.phone !== undefined) restaurantFields.phone = data.phone;
      if (data.email !== undefined) restaurantFields.email = data.email;
      if (data.address !== undefined) restaurantFields.address = data.address;
      if (data.gstNumber !== undefined) restaurantFields.gstNumber = data.gstNumber;
      if (data.logoUrl !== undefined) restaurantFields.logoUrl = data.logoUrl;

      const settingsFields: Record<string, any> = {};
      if (data.currency !== undefined) settingsFields.currency = data.currency;
      if (data.taxPercentage !== undefined) settingsFields.taxPercentage = data.taxPercentage;
      if (data.businessHours !== undefined) settingsFields.businessHours = data.businessHours;
      if (data.themeSettings !== undefined) settingsFields.themeSettings = data.themeSettings;


      // Perform transaction
      const updated = await prisma.$transaction(async (tx) => {
        // 1. Update restaurant profile
        const restaurantUpdate = await tx.restaurant.update({
          where: { id: restaurantId },
          data: restaurantFields,
        });

        // 2. Upsert settings
        const settingsUpsert = await tx.restaurantSetting.upsert({
          where: { restaurantId },
          update: settingsFields,
          create: {
            restaurantId,
            currency: settingsFields['currency'] ?? 'INR',
            taxPercentage: settingsFields['taxPercentage'] ?? 0,
            businessHours: settingsFields['businessHours'] ?? null,
            themeSettings: settingsFields['themeSettings'] ?? null,
          },
        });

        return { restaurant: restaurantUpdate, settings: settingsUpsert };
      });

      res.status(200).json({
        message: 'Settings updated successfully!',
        restaurant: {
          id: updated.restaurant.id,
          name: updated.restaurant.name,
          slug: updated.restaurant.slug,
          logoUrl: updated.restaurant.logoUrl,
          phone: updated.restaurant.phone,
          email: updated.restaurant.email,
          address: updated.restaurant.address,
          gstNumber: updated.restaurant.gstNumber,
        },
        settings: updated.settings,
      });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  }
}
