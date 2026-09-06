import { prisma } from '../../lib/prisma';
import { LedgerActionType } from '@prisma/client';
import { redisUrl, sharedRedis } from '../../lib/redis';
import { logSafeError, logStructured, safeError } from '../../lib/safe-error';
import { DeductionJob, DurableDeductionQueue, QueueStore } from './durable-deduction-queue';
import { getRequestId, requestIdOrNew, withRequestId } from '../../lib/request-context';

export class DeductionQueueService {
  private static durable = new DurableDeductionQueue(
    async () => await sharedRedis.commands() as unknown as QueueStore,
    async (job: DeductionJob) => this.deductStockForOrder(job.orderId, job.restaurantId),
    undefined,
    async (job, error) => {
      await prisma.auditLog.create({
        data: {
          action: 'INVENTORY_DEDUCTION_FAILED',
          entityType: 'ORDER',
          entityId: job.orderId,
          metadata: { ...safeError(error), restaurantId: job.restaurantId, requestId: getRequestId() },
        },
      });
    },
  );

  static async enqueueDeduction(orderId: string, restaurantId: string): Promise<void> {
    return withRequestId(requestIdOrNew(), () => this.enqueueWithContext(orderId, restaurantId));
  }

  private static async enqueueWithContext(orderId: string, restaurantId: string): Promise<void> {
    if (!redisUrl()) {
      await this.deductWithLocalRetry(orderId, restaurantId);
      return;
    }
    await this.durable.enqueue(orderId, restaurantId);
  }

  static async processPending(): Promise<void> {
    if (redisUrl()) await this.durable.drain();
  }

  static async getStatus(): Promise<{
    ready: number; processing: number; deadLetter: number;
    success: number; failures: number; retries: number;
  }> {
    if (!redisUrl()) return {
      ready: 0, processing: 0, deadLetter: 0, success: 0, failures: 0, retries: 0,
    };
    return this.durable.getStatus();
  }

  private static async deductWithLocalRetry(orderId: string, restaurantId: string): Promise<void> {
    let lastError: unknown;
    for (let attempt = 1; attempt <= 3; attempt++) {
      try {
        await this.deductStockForOrder(orderId, restaurantId);
        return;
      } catch (error) {
        lastError = error;
        logSafeError('deduction.local', error, 'inventory', { attempt, orderId, restaurantId });
        if (attempt < 3) {
          await new Promise(resolve => setTimeout(resolve, 250 * (2 ** (attempt - 1))));
        }
      }
    }
    throw lastError;
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
          logStructured('info', 'inventory', 'deduction.idempotency', 'skipped',
            'Stock deduction already recorded', { orderId, restaurantId, orderItemId: item.id });
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
          metadata: { restaurantId, requestId: getRequestId() },
        },
      });
    });
  }
}
