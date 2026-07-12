import { prisma } from '../../lib/prisma';
import { PurchaseOrder, PurchaseOrderStatus, LedgerActionType } from '@prisma/client';

export class PurchaseRepository {
  async findMany(restaurantId: string): Promise<PurchaseOrder[]> {
    return prisma.purchaseOrder.findMany({
      where: { restaurantId },
      include: {
        supplier: {
          select: {
            name: true,
          },
        },
      },
      orderBy: { orderDate: 'desc' },
    });
  }

  async findById(id: string, restaurantId: string): Promise<any | null> {
    return prisma.purchaseOrder.findFirst({
      where: { id, restaurantId },
      include: {
        supplier: true,
        items: {
          include: {
            rawMaterial: true,
          },
        },
      },
    });
  }

  async create(
    restaurantId: string,
    data: {
      supplierId: string;
      poNumber: string;
      status?: PurchaseOrderStatus;
      orderDate?: Date;
      expectedDate?: Date;
      subtotal: number;
      gstAmount: number;
      grandTotal: number;
      notes?: string;
      items: Array<{
        rawMaterialId: string;
        quantity: number;
        unitPrice: number;
        gstPercentage?: number;
        totalCost: number;
        expiryDate?: Date;
      }>;
    }
  ): Promise<PurchaseOrder> {
    return prisma.$transaction(async (tx) => {
      const { items, ...poData } = data;

      const purchaseOrder = await tx.purchaseOrder.create({
        data: {
          restaurantId,
          supplierId: poData.supplierId,
          poNumber: poData.poNumber,
          status: poData.status || PurchaseOrderStatus.DRAFT,
          orderDate: poData.orderDate || new Date(),
          expectedDate: poData.expectedDate || null,
          subtotal: poData.subtotal,
          gstAmount: poData.gstAmount,
          grandTotal: poData.grandTotal,
          notes: poData.notes || null,
          items: {
            create: items.map(item => ({
              rawMaterialId: item.rawMaterialId,
              quantity: item.quantity,
              unitPrice: item.unitPrice,
              gstPercentage: item.gstPercentage || 0,
              totalCost: item.totalCost,
              expiryDate: item.expiryDate || null,
            })),
          },
        },
      });

      return purchaseOrder;
    });
  }

  async update(
    id: string,
    restaurantId: string,
    data: {
      supplierId?: string;
      poNumber?: string;
      status?: PurchaseOrderStatus;
      orderDate?: Date;
      expectedDate?: Date;
      subtotal?: number;
      gstAmount?: number;
      grandTotal?: number;
      invoiceNumber?: string;
      invoiceAttachmentUrl?: string;
      notes?: string;
      items?: Array<{
        rawMaterialId: string;
        quantity: number;
        unitPrice: number;
        gstPercentage?: number;
        totalCost: number;
        expiryDate?: Date;
      }>;
    }
  ): Promise<PurchaseOrder> {
    return prisma.$transaction(async (tx) => {
      const { items, ...poData } = data;

      // Check if PO exists and is not already RECEIVED
      const existing = await tx.purchaseOrder.findFirst({
        where: { id, restaurantId },
      });

      if (!existing) {
        throw new Error('Purchase order not found or unauthorized');
      }

      if (existing.status === PurchaseOrderStatus.RECEIVED) {
        throw new Error('Cannot update a received purchase order');
      }

      // If items are provided, delete old ones and recreate
      if (items) {
        await tx.purchaseOrderItem.deleteMany({
          where: { poId: id },
        });

        await tx.purchaseOrder.update({
          where: { id },
          data: {
            supplierId: poData.supplierId,
            poNumber: poData.poNumber,
            status: poData.status,
            orderDate: poData.orderDate,
            expectedDate: poData.expectedDate !== undefined ? poData.expectedDate : undefined,
            subtotal: poData.subtotal,
            gstAmount: poData.gstAmount,
            grandTotal: poData.grandTotal,
            notes: poData.notes !== undefined ? poData.notes : undefined,
            items: {
              create: items.map(item => ({
                rawMaterialId: item.rawMaterialId,
                quantity: item.quantity,
                unitPrice: item.unitPrice,
                gstPercentage: item.gstPercentage || 0,
                totalCost: item.totalCost,
                expiryDate: item.expiryDate || null,
              })),
            },
          } as any,
        });
      } else {
        await tx.purchaseOrder.update({
          where: { id },
          data: poData as any,
        });
      }

      const updated = await tx.purchaseOrder.findUnique({
        where: { id },
      });

      if (!updated) {
        throw new Error('Purchase order not found after update');
      }

      return updated;
    });
  }

  async receive(
    id: string,
    restaurantId: string,
    data: {
      receivedDate: Date;
      invoiceNumber?: string;
      invoiceAttachmentUrl?: string;
      notes?: string;
    }
  ): Promise<PurchaseOrder> {
    return prisma.$transaction(async (tx) => {
      // 1. Fetch the Purchase Order with items
      const po = await tx.purchaseOrder.findFirst({
        where: { id, restaurantId },
        include: { items: true },
      });

      if (!po) {
        throw new Error('Purchase order not found or unauthorized');
      }

      if (po.status === PurchaseOrderStatus.RECEIVED) {
        throw new Error('Purchase order has already been received');
      }

      // 2. Process each item to update stock, average cost and log batches
      for (const item of po.items) {
        const material = await tx.rawMaterial.findFirst({
          where: { id: item.rawMaterialId, restaurantId },
        });

        if (!material) {
          throw new Error(`Raw material ${item.rawMaterialId} not found`);
        }

        const currentStock = material.currentStock;
        const previousAverageCost = material.averageCost;
        const quantityReceived = item.quantity;
        const unitPrice = item.unitPrice;

        // Calculate new weighted average cost
        let newAverageCost = previousAverageCost;
        const newStock = currentStock + quantityReceived;

        if (newStock > 0) {
          newAverageCost = ((currentStock * previousAverageCost) + (quantityReceived * unitPrice)) / newStock;
        } else {
          newAverageCost = unitPrice;
        }

        // Update Raw Material
        await tx.rawMaterial.update({
          where: { id: item.rawMaterialId },
          data: {
            currentStock: newStock,
            averageCost: newAverageCost,
            purchasePrice: unitPrice, // Update last purchase price
            lastPurchaseDate: data.receivedDate,
          },
        });

        // Write to Stock Ledger
        await tx.stockLedger.create({
          data: {
            restaurantId,
            rawMaterialId: item.rawMaterialId,
            quantity: quantityReceived,
            previousStock: currentStock,
            newStock,
            actionType: LedgerActionType.PURCHASE_RECEIPT,
            referenceId: item.id,
            reason: `Purchase Order ${po.poNumber} receipt`,
          },
        });

        // Write to Stock Batch for expiry tracking
        const batchExpiry = item.expiryDate || new Date(Date.now() + 365 * 24 * 60 * 60 * 1000); // Default 1 year from now
        await tx.stockBatch.create({
          data: {
            rawMaterialId: item.rawMaterialId,
            batchNumber: `${po.poNumber}-${item.id.slice(0, 8)}`,
            quantity: quantityReceived,
            purchasePrice: unitPrice,
            expiryDate: batchExpiry,
            receivedDate: data.receivedDate,
          },
        });
      }

      // 3. Update Supplier Outstanding Balance (grandTotal added to outstanding balance)
      await tx.supplier.update({
        where: { id: po.supplierId },
        data: {
          outstandingBalance: {
            increment: po.grandTotal,
          },
        },
      });

      // 4. Update PO status to RECEIVED
      const updatedPO = await tx.purchaseOrder.update({
        where: { id },
        data: {
          status: PurchaseOrderStatus.RECEIVED,
          receivedDate: data.receivedDate,
          invoiceNumber: data.invoiceNumber || po.invoiceNumber || null,
          invoiceAttachmentUrl: data.invoiceAttachmentUrl || po.invoiceAttachmentUrl || null,
          notes: data.notes || po.notes || null,
        },
      });

      return updatedPO;
    });
  }
}
