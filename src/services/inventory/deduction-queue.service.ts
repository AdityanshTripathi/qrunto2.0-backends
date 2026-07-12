import { prisma } from '../../lib/prisma';
import { LedgerActionType } from '@prisma/client';

interface DeductionJob {
  orderId: string;
  restaurantId: string;
}

export class DeductionQueueService {
  private static queue: DeductionJob[] = [];
  private static isProcessing = false;

  static enqueueDeduction(orderId: string, restaurantId: string) {
    this.queue.push({ orderId, restaurantId });
    console.log(`[DeductionQueue] Enqueued order ${orderId} for restaurant ${restaurantId}. Queue length: ${this.queue.length}`);
    this.processQueue();
  }

  private static async processQueue() {
    if (this.isProcessing) return;
    this.isProcessing = true;

    while (this.queue.length > 0) {
      const job = this.queue.shift();
      if (!job) continue;

      try {
        console.log(`[DeductionQueue] Processing order ${job.orderId}...`);
        await this.deductStockForOrder(job.orderId, job.restaurantId);
        console.log(`[DeductionQueue] Successfully processed order ${job.orderId}`);
      } catch (err: any) {
        console.error(`[DeductionQueue] Failed to process order ${job.orderId}:`, err);
        // Log to AuditLog for visibility
        try {
          await prisma.auditLog.create({
            data: {
              action: 'INVENTORY_DEDUCTION_FAILED',
              entityType: 'ORDER',
              entityId: job.orderId,
              metadata: { error: err.message, restaurantId: job.restaurantId },
            },
          });
        } catch (logErr) {
          console.error('[DeductionQueue] Failed to write audit log:', logErr);
        }
      }
    }

    this.isProcessing = false;
  }

  private static async deductStockForOrder(orderId: string, restaurantId: string) {
    return await prisma.$transaction(async (tx) => {
      // 1. Fetch the Order with items
      const order = await tx.order.findFirst({
        where: { id: orderId, restaurantId },
        include: {
          orderItems: {
            include: {
              menuItem: {
                include: {
                  recipe: {
                    include: {
                      ingredients: {
                        include: {
                          rawMaterial: true,
                        },
                      },
                    },
                  },
                },
              },
            },
          },
        },
      });

      if (!order) {
        throw new Error(`Order ${orderId} not found`);
      }

      // 2. Process each item
      for (const item of order.orderItems) {
        if (!item.menuItem?.recipe) {
          // No recipe defined for this menu item, skip
          continue;
        }

        // Idempotency check: check if stock has already been deducted for this order item
        const existingLedger = await tx.stockLedger.findFirst({
          where: {
            referenceId: item.id,
            actionType: LedgerActionType.SALE_DEDUCTION,
          },
        });

        if (existingLedger) {
          console.log(`[DeductionQueue] Stock already deducted for order item ${item.id}, skipping.`);
          continue;
        }

        const recipe = item.menuItem.recipe;

        for (const ing of recipe.ingredients) {
          const material = await tx.rawMaterial.findFirst({
            where: { id: ing.rawMaterialId, restaurantId },
          });

          if (!material) {
            throw new Error(`Raw material ${ing.rawMaterialId} not found in restaurant ${restaurantId}`);
          }

          let conversionFactor = 1;
          const unit = (material.unit || '').toUpperCase().trim();
          if (unit === 'KG' || unit === 'LTR' || unit === 'L') {
            conversionFactor = 1000;
          }

          const quantityToDeduct = (ing.quantity * item.quantity) / conversionFactor;

          const previousStock = material.currentStock;
          const newStock = previousStock - quantityToDeduct;

          // Deduct stock in raw material
          await tx.rawMaterial.update({
            where: { id: ing.rawMaterialId },
            data: { currentStock: newStock },
          });

          // Log in Stock Ledger
          await tx.stockLedger.create({
            data: {
              restaurantId,
              rawMaterialId: ing.rawMaterialId,
              quantity: -quantityToDeduct,
              previousStock,
              newStock,
              actionType: LedgerActionType.SALE_DEDUCTION,
              referenceId: item.id,
              reason: `Order #${order.orderNumber} sale of item "${item.itemName}" (Qty: ${item.quantity})`,
            },
          });
        }
      }

      // 3. Log success in AuditLog
      await tx.auditLog.create({
        data: {
          action: 'INVENTORY_DEDUCTION_SUCCESS',
          entityType: 'ORDER',
          entityId: orderId,
          metadata: { restaurantId },
        },
      });
    });
  }
}
