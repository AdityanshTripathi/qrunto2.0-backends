import { prisma } from '../../lib/prisma';
import { WastageRecord, WastageReason, LedgerActionType } from '@prisma/client';

export class WastageService {
  async getWastageRecords(restaurantId: string): Promise<WastageRecord[]> {
    return prisma.wastageRecord.findMany({
      where: { restaurantId },
      include: {
        rawMaterial: {
          select: {
            name: true,
            unit: true,
            sku: true,
          },
        },
        user: {
          select: {
            name: true,
          },
        },
      },
      orderBy: { wasteDate: 'desc' },
    });
  }

  async createWastageRecord(
    restaurantId: string,
    userId: string,
    data: {
      rawMaterialId: string;
      quantity: number;
      reason: WastageReason;
      notes?: string;
      wasteDate?: Date;
    }
  ): Promise<WastageRecord> {
    return prisma.$transaction(async (tx) => {
      // 1. Fetch raw material to get current stock and average cost
      const material = await tx.rawMaterial.findFirst({
        where: { id: data.rawMaterialId, restaurantId },
      });

      if (!material) {
        throw new Error('Raw material not found or unauthorized');
      }

      // Calculate cost based on average cost
      const wastageCost = data.quantity * material.averageCost;
      const previousStock = material.currentStock;
      const newStock = previousStock - data.quantity;

      // 2. Update current stock in RawMaterial
      await tx.rawMaterial.update({
        where: { id: data.rawMaterialId },
        data: { currentStock: newStock },
      });

      // 3. Write to Stock Ledger
      await tx.stockLedger.create({
        data: {
          restaurantId,
          rawMaterialId: data.rawMaterialId,
          userId,
          quantity: -data.quantity,
          previousStock,
          newStock,
          actionType: LedgerActionType.WASTAGE_RECORD,
          reason: `Wastage record: ${data.reason}. ${data.notes || ''}`,
        },
      });

      // 4. Create Wastage Record
      const record = await tx.wastageRecord.create({
        data: {
          restaurantId,
          rawMaterialId: data.rawMaterialId,
          userId,
          quantity: data.quantity,
          cost: wastageCost,
          reason: data.reason,
          notes: data.notes || null,
          wasteDate: data.wasteDate || new Date(),
        },
      });

      return record;
    });
  }
}
