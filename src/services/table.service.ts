import { TableRepository } from '../repositories/table.repository';
import { SubscriptionRepository } from '../repositories/subscription.repository';
import { RestaurantTable } from '@prisma/client';
import { prisma } from '../lib/prisma';

const tableRepository = new TableRepository();
const subscriptionRepository = new SubscriptionRepository();

// Base URL for QR codes - used as the value encoded in the QR
const APP_BASE_URL = process.env.APP_BASE_URL || 'https://qrunto.vercel.app';


export class TableService {
  async getTables(restaurantId: string): Promise<RestaurantTable[]> {
    return tableRepository.findMany(restaurantId);
  }

  async getTableById(id: string, restaurantId: string): Promise<RestaurantTable | null> {
    return tableRepository.findById(id, restaurantId);
  }

  async createTable(restaurantId: string, tableNumber: string): Promise<RestaurantTable> {
    // 1. Enforce subscription table limit
    const activeSub = await subscriptionRepository.findActiveSubscriptionByRestaurantId(restaurantId);
    if (!activeSub) {
      throw new Error('No active subscription found. Please select a plan to add tables.');
    }

    const maxTables = activeSub.plan.maxTables;
    const currentCount = await tableRepository.count(restaurantId);
    if (currentCount >= maxTables) {
      throw new Error(`Table limit reached. Your plan allows up to ${maxTables} tables. Please upgrade.`);
    }

    // 2. Check for duplicate table number within this restaurant
    const existing = await tableRepository.findByTableNumber(tableNumber, restaurantId);
    if (existing) {
      throw new Error(`Table "${tableNumber}" already exists. Please use a different table number.`);
    }

    // 3. Fetch restaurant slug for QR URL generation
    const restaurant = await prisma.restaurant.findUnique({
      where: { id: restaurantId },
      select: { slug: true },
    });
    if (!restaurant) {
      throw new Error('Restaurant not found');
    }

    // 4. Build the ordering URL (this is what the QR code encodes)
    const orderingUrl = `${APP_BASE_URL}/order/${restaurant.slug}/${encodeURIComponent(tableNumber)}`;

    // 5. Create table with QR URL
    return tableRepository.create({
      restaurantId,
      tableNumber,
      qrCodeUrl: orderingUrl,
    });
  }

  async updateTable(
    id: string,
    restaurantId: string,
    data: { tableNumber?: string; isActive?: boolean }
  ): Promise<RestaurantTable> {
    // 1. Verify existence
    const table = await tableRepository.findById(id, restaurantId);
    if (!table) {
      throw new Error('Table not found or unauthorized');
    }

    // 2. If renaming the table, check for duplicates and regenerate QR URL
    const payload: { tableNumber?: string; isActive?: boolean; qrCodeUrl?: string } = {};

    if (data.tableNumber && data.tableNumber !== table.tableNumber) {
      const existing = await tableRepository.findByTableNumber(data.tableNumber, restaurantId);
      if (existing && existing.id !== id) {
        throw new Error(`Table "${data.tableNumber}" already exists.`);
      }

      // Regenerate QR URL with new table number
      const restaurant = await prisma.restaurant.findUnique({
        where: { id: restaurantId },
        select: { slug: true },
      });
      if (!restaurant) throw new Error('Restaurant not found');

      payload.tableNumber = data.tableNumber;
      payload.qrCodeUrl = `${APP_BASE_URL}/order/${restaurant.slug}/${encodeURIComponent(data.tableNumber)}`;
    }

    if (data.isActive !== undefined) {
      payload.isActive = data.isActive;
    }

    return tableRepository.update(id, restaurantId, payload);
  }

  async deleteTable(id: string, restaurantId: string): Promise<RestaurantTable> {
    const table = await tableRepository.findById(id, restaurantId);
    if (!table) {
      throw new Error('Table not found or unauthorized');
    }
    return tableRepository.softDelete(id, restaurantId);
  }
}
