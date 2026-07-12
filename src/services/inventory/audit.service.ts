import { prisma } from '../../lib/prisma';
import { StockAudit, LedgerActionType } from '@prisma/client';

export class AuditService {
  async getAudits(restaurantId: string): Promise<StockAudit[]> {
    return prisma.stockAudit.findMany({
      where: { restaurantId },
      include: {
        user: {
          select: {
            name: true,
          },
        },
        items: {
          include: {
            rawMaterial: {
              select: {
                name: true,
                unit: true,
                sku: true,
              },
            },
          },
        },
      },
      orderBy: { auditDate: 'desc' },
    });
  }

  async createAudit(
    restaurantId: string,
    userId: string,
    data: {
      notes?: string;
      items: Array<{
        rawMaterialId: string;
        actualStock: number;
        notes?: string;
      }>;
    }
  ): Promise<StockAudit> {
    return prisma.$transaction(async (tx) => {
      // 1. Create StockAudit header
      const audit = await tx.stockAudit.create({
        data: {
          restaurantId,
          userId,
          notes: data.notes || null,
        },
      });

      // 2. Process each audit item
      for (const item of data.items) {
        const material = await tx.rawMaterial.findFirst({
          where: { id: item.rawMaterialId, restaurantId },
        });

        if (!material) {
          throw new Error(`Raw material ${item.rawMaterialId} not found`);
        }

        const expectedStock = material.currentStock;
        const actualStock = item.actualStock;
        const variance = actualStock - expectedStock;

        // Create StockAuditItem
        await tx.stockAuditItem.create({
          data: {
            auditId: audit.id,
            rawMaterialId: item.rawMaterialId,
            expectedStock,
            actualStock,
            variance,
            notes: item.notes || null,
          },
        });

        // If variance is non-zero, adjust stock and log to ledger
        if (variance !== 0) {
          await tx.rawMaterial.update({
            where: { id: item.rawMaterialId },
            data: { currentStock: actualStock },
          });

          await tx.stockLedger.create({
            data: {
              restaurantId,
              rawMaterialId: item.rawMaterialId,
              userId,
              quantity: variance,
              previousStock: expectedStock,
              newStock: actualStock,
              actionType: LedgerActionType.PHYSICAL_AUDIT,
              reason: `Physical audit: expected ${expectedStock}, actual ${actualStock}. Variance: ${variance}. Notes: ${item.notes || ''}`,
            },
          });
        }
      }

      // Re-fetch audit with detailed items
      const result = await tx.stockAudit.findUnique({
        where: { id: audit.id },
        include: {
          items: {
            include: {
              rawMaterial: true,
            },
          },
        },
      });

      if (!result) {
        throw new Error('Failed to retrieve audit record after creation');
      }

      return result;
    });
  }
}
