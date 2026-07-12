import { prisma } from '../../lib/prisma';
import { StockTransfer, TransferStatus, LedgerActionType, RawMaterialStatus } from '@prisma/client';

export class TransferService {
  async getTransfers(restaurantId: string): Promise<StockTransfer[]> {
    return prisma.stockTransfer.findMany({
      where: {
        OR: [
          { sourceBranchId: restaurantId },
          { destBranchId: restaurantId },
        ],
      },
      include: {
        sourceBranch: {
          select: { name: true },
        },
        destBranch: {
          select: { name: true },
        },
        createdBy: {
          select: { name: true },
        },
        approvedBy: {
          select: { name: true },
        },
        items: {
          include: {
            rawMaterial: {
              select: { name: true, unit: true, sku: true },
            },
          },
        },
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  async createTransfer(
    sourceBranchId: string,
    userId: string,
    data: {
      destBranchId: string;
      notes?: string;
      items: Array<{
        rawMaterialId: string;
        quantity: number;
      }>;
    }
  ): Promise<StockTransfer> {
    return prisma.$transaction(async (tx) => {
      // 1. Fetch Source Branch to verify brandId
      const sourceBranch = await tx.restaurant.findUnique({
        where: { id: sourceBranchId },
        select: { brandId: true, name: true },
      });

      if (!sourceBranch || !sourceBranch.brandId) {
        throw new Error('Source branch not found or has no brand associated');
      }

      // Verify Dest Branch belongs to the same brand
      const destBranch = await tx.restaurant.findFirst({
        where: { id: data.destBranchId, brandId: sourceBranch.brandId },
      });

      if (!destBranch) {
        throw new Error('Destination branch not found or belongs to a different brand');
      }

      // 2. Generate Transfer Number
      const dateStr = new Date().toISOString().slice(0, 10).replace(/-/g, '');
      const rand = Math.floor(1000 + Math.random() * 9000);
      const transferNumber = `TRF-${dateStr}-${rand}`;

      // 3. Create StockTransfer
      const transfer = await tx.stockTransfer.create({
        data: {
          brandId: sourceBranch.brandId,
          sourceBranchId,
          destBranchId: data.destBranchId,
          transferNumber,
          notes: data.notes || null,
          createdById: userId,
          status: TransferStatus.PENDING,
          items: {
            create: data.items.map(item => ({
              rawMaterialId: item.rawMaterialId,
              quantity: item.quantity,
            })),
          },
        },
      });

      // 4. Reserve stock at source: decrement source stock and write ledger
      for (const item of data.items) {
        const material = await tx.rawMaterial.findFirst({
          where: { id: item.rawMaterialId, restaurantId: sourceBranchId },
        });

        if (!material) {
          throw new Error(`Raw material ${item.rawMaterialId} not found in source branch`);
        }

        if (material.currentStock < item.quantity) {
          throw new Error(`Insufficient stock for ${material.name} at source branch. Available: ${material.currentStock}`);
        }

        const previousStock = material.currentStock;
        const newStock = previousStock - item.quantity;

        await tx.rawMaterial.update({
          where: { id: item.rawMaterialId },
          data: { currentStock: newStock },
        });

        await tx.stockLedger.create({
          data: {
            restaurantId: sourceBranchId,
            rawMaterialId: item.rawMaterialId,
            userId,
            quantity: -item.quantity,
            previousStock,
            newStock,
            actionType: LedgerActionType.TRANSFER_OUT,
            referenceId: transfer.id,
            reason: `Transfer #${transferNumber} to ${destBranch.name}`,
          },
        });
      }

      return transfer;
    });
  }

  async approveTransfer(id: string, destBranchId: string, userId: string): Promise<StockTransfer> {
    return prisma.$transaction(async (tx) => {
      // 1. Fetch Transfer
      const transfer = await tx.stockTransfer.findFirst({
        where: { id, destBranchId },
        include: { items: { include: { rawMaterial: true } } },
      });

      if (!transfer) {
        throw new Error('Transfer request not found or unauthorized');
      }

      if (transfer.status !== TransferStatus.PENDING) {
        throw new Error(`Cannot approve a transfer with status ${transfer.status}`);
      }

      // 2. Add stock and update average cost at destination branch
      for (const item of transfer.items) {
        const sourceMaterial = item.rawMaterial;

        // Find or create RawMaterial at destination branch by SKU
        let destMaterial = await tx.rawMaterial.findFirst({
          where: { sku: sourceMaterial.sku, restaurantId: destBranchId },
        });

        if (!destMaterial) {
          // Create the raw material at destination
          destMaterial = await tx.rawMaterial.create({
            data: {
              restaurantId: destBranchId,
              name: sourceMaterial.name,
              category: sourceMaterial.category,
              sku: sourceMaterial.sku,
              unit: sourceMaterial.unit,
              openingStock: 0,
              currentStock: 0,
              minimumStockLevel: sourceMaterial.minimumStockLevel,
              maximumStockLevel: sourceMaterial.maximumStockLevel,
              reorderQuantity: sourceMaterial.reorderQuantity,
              purchasePrice: sourceMaterial.purchasePrice,
              averageCost: sourceMaterial.averageCost,
              status: RawMaterialStatus.ACTIVE,
            },
          });
        }

        const previousStock = destMaterial.currentStock;
        const newStock = previousStock + item.quantity;

        // Recalculate Destination Average Cost:
        // New Average Cost = ((Current Stock * Current Avg Cost) + (Transfer Qty * Source Avg Cost)) / (Current Stock + Transfer Qty)
        let newAverageCost = destMaterial.averageCost;
        if (newStock > 0) {
          newAverageCost = ((previousStock * destMaterial.averageCost) + (item.quantity * sourceMaterial.averageCost)) / newStock;
        }

        await tx.rawMaterial.update({
          where: { id: destMaterial.id },
          data: {
            currentStock: newStock,
            averageCost: newAverageCost,
          },
        });

        // Write ledger entry at destination
        await tx.stockLedger.create({
          data: {
            restaurantId: destBranchId,
            rawMaterialId: destMaterial.id,
            userId,
            quantity: item.quantity,
            previousStock,
            newStock,
            actionType: LedgerActionType.TRANSFER_IN,
            referenceId: transfer.id,
            reason: `Transfer #${transfer.transferNumber} received`,
          },
        });
      }

      // 3. Mark Transfer as COMPLETED
      const updated = await tx.stockTransfer.update({
        where: { id },
        data: {
          status: TransferStatus.COMPLETED,
          approvedById: userId,
          receivedDate: new Date(),
        },
      });

      return updated;
    });
  }

  async rejectTransfer(id: string, destBranchId: string, userId: string): Promise<StockTransfer> {
    return prisma.$transaction(async (tx) => {
      // 1. Fetch Transfer
      const transfer = await tx.stockTransfer.findFirst({
        where: { id, destBranchId },
        include: { items: { include: { rawMaterial: true } } },
      });

      if (!transfer) {
        throw new Error('Transfer request not found or unauthorized');
      }

      if (transfer.status !== TransferStatus.PENDING) {
        throw new Error(`Cannot reject a transfer with status ${transfer.status}`);
      }

      // 2. Return reserved stock back to source branch
      for (const item of transfer.items) {
        const material = await tx.rawMaterial.findFirst({
          where: { id: item.rawMaterialId, restaurantId: transfer.sourceBranchId },
        });

        if (!material) {
          throw new Error(`Raw material ${item.rawMaterialId} not found in source branch during rollback`);
        }

        const previousStock = material.currentStock;
        const newStock = previousStock + item.quantity;

        await tx.rawMaterial.update({
          where: { id: item.rawMaterialId },
          data: { currentStock: newStock },
        });

        // Write ledger adjustment entry at source
        await tx.stockLedger.create({
          data: {
            restaurantId: transfer.sourceBranchId,
            rawMaterialId: item.rawMaterialId,
            userId,
            quantity: item.quantity,
            previousStock,
            newStock,
            actionType: LedgerActionType.MANUAL_ADJUSTMENT,
            referenceId: transfer.id,
            reason: `Transfer #${transfer.transferNumber} rejected - stock returned`,
          },
        });
      }

      // 3. Mark Transfer as REJECTED
      const updated = await tx.stockTransfer.update({
        where: { id },
        data: {
          status: TransferStatus.REJECTED,
          approvedById: userId,
        },
      });

      return updated;
    });
  }
}
