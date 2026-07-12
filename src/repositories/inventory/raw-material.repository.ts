import { prisma } from '../../lib/prisma';
import { RawMaterial, RawMaterialStatus, LedgerActionType } from '@prisma/client';

export interface RawMaterialFilters {
  category?: string;
  status?: RawMaterialStatus;
  lowStock?: boolean;
}

export class RawMaterialRepository {
  async findMany(restaurantId: string, filters?: RawMaterialFilters): Promise<RawMaterial[]> {
    const whereClause: any = { restaurantId };

    if (filters) {
      if (filters.category) {
        whereClause.category = filters.category;
      }
      if (filters.status) {
        whereClause.status = filters.status;
      }
      if (filters.lowStock === true) {
        // currentStock <= minimumStockLevel
        // In Prisma, comparing two fields of the same model can be done using findMany with an expression or by fetching and filtering.
        // Or we can write it in SQL, or fetch and filter, or use Prisma's nested where clauses.
        // Wait, a clean Prisma filter: we can compare against the field, but Prisma doesn't natively support field-to-field comparisons in where without `prisma.rawMaterial.findMany` with custom where.
        // A simple way is to use prisma.$queryRaw or filter in JS if the inventory list is reasonably sized.
        // Actually, let's fetch all and filter in JS if lowStock is requested, or use prisma.$queryRaw. 
        // Let's do it in JS since restaurants usually have < 1000 raw materials, which is extremely fast and safe from SQL dialects.
      }
    }

    const items = await prisma.rawMaterial.findMany({
      where: whereClause,
      include: {
        supplier: {
          select: {
            id: true,
            name: true,
          },
        },
      },
      orderBy: { name: 'asc' },
    });

    if (filters && filters.lowStock === true) {
      return items.filter(item => item.currentStock <= item.minimumStockLevel);
    }

    return items;
  }

  async findById(id: string, restaurantId: string): Promise<RawMaterial | null> {
    return prisma.rawMaterial.findFirst({
      where: { id, restaurantId },
      include: {
        supplier: {
          select: {
            id: true,
            name: true,
          },
        },
      },
    });
  }

  async create(
    restaurantId: string,
    data: {
      supplierId?: string;
      name: string;
      category: string;
      sku: string;
      unit: string;
      openingStock: number;
      currentStock: number;
      minimumStockLevel: number;
      maximumStockLevel: number;
      reorderQuantity: number;
      purchasePrice: number;
      averageCost: number;
      expiryDate?: Date;
      storageLocation?: string;
      notes?: string;
      status?: RawMaterialStatus;
    }
  ): Promise<RawMaterial> {
    // Wrap in transaction to also write an OPENING_STOCK ledger entry if currentStock > 0 or openingStock > 0
    return prisma.$transaction(async (tx) => {
      const material = await tx.rawMaterial.create({
        data: {
          restaurantId,
          supplierId: data.supplierId || null,
          name: data.name,
          category: data.category,
          sku: data.sku,
          unit: data.unit,
          openingStock: data.openingStock,
          currentStock: data.currentStock,
          minimumStockLevel: data.minimumStockLevel,
          maximumStockLevel: data.maximumStockLevel,
          reorderQuantity: data.reorderQuantity,
          purchasePrice: data.purchasePrice,
          averageCost: data.averageCost,
          expiryDate: data.expiryDate || null,
          storageLocation: data.storageLocation || null,
          notes: data.notes || null,
          status: data.status || RawMaterialStatus.ACTIVE,
        },
      });

      if (material.currentStock > 0) {
        await tx.stockLedger.create({
          data: {
            restaurantId,
            rawMaterialId: material.id,
            quantity: material.currentStock,
            previousStock: 0,
            newStock: material.currentStock,
            actionType: LedgerActionType.OPENING_STOCK,
            reason: 'Initial setup opening stock',
          },
        });
      }

      return material;
    });
  }

  async update(
    id: string,
    restaurantId: string,
    data: Partial<Omit<RawMaterial, 'id' | 'restaurantId' | 'createdAt' | 'updatedAt'>>
  ): Promise<RawMaterial> {
    await prisma.rawMaterial.updateMany({
      where: { id, restaurantId },
      data,
    });

    const updated = await this.findById(id, restaurantId);
    if (!updated) {
      throw new Error('Raw material not found or unauthorized');
    }
    return updated;
  }

  async adjustStock(
    id: string,
    restaurantId: string,
    quantityChange: number,
    userId: string,
    actionType: LedgerActionType,
    reason?: string
  ): Promise<RawMaterial> {
    return prisma.$transaction(async (tx) => {
      const material = await tx.rawMaterial.findFirst({
        where: { id, restaurantId },
      });

      if (!material) {
        throw new Error('Raw material not found or unauthorized');
      }

      const previousStock = material.currentStock;
      const newStock = previousStock + quantityChange;

      await tx.rawMaterial.update({
        where: { id },
        data: { currentStock: newStock },
      });

      await tx.stockLedger.create({
        data: {
          restaurantId,
          rawMaterialId: id,
          userId,
          quantity: quantityChange,
          previousStock,
          newStock,
          actionType,
          reason: reason || null,
        },
      });

      const updated = await tx.rawMaterial.findFirst({
        where: { id, restaurantId },
        include: {
          supplier: {
            select: {
              id: true,
              name: true,
            },
          },
        },
      });

      if (!updated) {
        throw new Error('Raw material not found after update');
      }

      return updated;
    });
  }

  async softDelete(id: string, restaurantId: string): Promise<RawMaterial> {
    return this.update(id, restaurantId, { status: RawMaterialStatus.INACTIVE });
  }
}
