"use strict";
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.DeductionQueueService = void 0;
const prisma_1 = require("../../lib/prisma");
const client_1 = require("@prisma/client");
class DeductionQueueService {
    static enqueueDeduction(orderId, restaurantId) {
        this.queue.push({ orderId, restaurantId });
        console.log(`[DeductionQueue] Enqueued order ${orderId} for restaurant ${restaurantId}. Queue length: ${this.queue.length}`);
        this.processQueue();
    }
    static processQueue() {
        return __awaiter(this, void 0, void 0, function* () {
            if (this.isProcessing)
                return;
            this.isProcessing = true;
            while (this.queue.length > 0) {
                const job = this.queue.shift();
                if (!job)
                    continue;
                try {
                    console.log(`[DeductionQueue] Processing order ${job.orderId}...`);
                    yield this.deductStockForOrder(job.orderId, job.restaurantId);
                    console.log(`[DeductionQueue] Successfully processed order ${job.orderId}`);
                }
                catch (err) {
                    console.error(`[DeductionQueue] Failed to process order ${job.orderId}:`, err);
                    // Log to AuditLog for visibility
                    try {
                        yield prisma_1.prisma.auditLog.create({
                            data: {
                                action: 'INVENTORY_DEDUCTION_FAILED',
                                entityType: 'ORDER',
                                entityId: job.orderId,
                                metadata: { error: err.message, restaurantId: job.restaurantId },
                            },
                        });
                    }
                    catch (logErr) {
                        console.error('[DeductionQueue] Failed to write audit log:', logErr);
                    }
                }
            }
            this.isProcessing = false;
        });
    }
    static deductStockForOrder(orderId, restaurantId) {
        return __awaiter(this, void 0, void 0, function* () {
            return yield prisma_1.prisma.$transaction((tx) => __awaiter(this, void 0, void 0, function* () {
                var _a;
                // 1. Fetch the Order with items
                const order = yield tx.order.findFirst({
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
                    if (!((_a = item.menuItem) === null || _a === void 0 ? void 0 : _a.recipe)) {
                        // No recipe defined for this menu item, skip
                        continue;
                    }
                    // Idempotency check: check if stock has already been deducted for this order item
                    const existingLedger = yield tx.stockLedger.findFirst({
                        where: {
                            referenceId: item.id,
                            actionType: client_1.LedgerActionType.SALE_DEDUCTION,
                        },
                    });
                    if (existingLedger) {
                        console.log(`[DeductionQueue] Stock already deducted for order item ${item.id}, skipping.`);
                        continue;
                    }
                    const recipe = item.menuItem.recipe;
                    for (const ing of recipe.ingredients) {
                        const material = yield tx.rawMaterial.findFirst({
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
                        yield tx.rawMaterial.update({
                            where: { id: ing.rawMaterialId },
                            data: { currentStock: newStock },
                        });
                        // Log in Stock Ledger
                        yield tx.stockLedger.create({
                            data: {
                                restaurantId,
                                rawMaterialId: ing.rawMaterialId,
                                quantity: -quantityToDeduct,
                                previousStock,
                                newStock,
                                actionType: client_1.LedgerActionType.SALE_DEDUCTION,
                                referenceId: item.id,
                                reason: `Order #${order.orderNumber} sale of item "${item.itemName}" (Qty: ${item.quantity})`,
                            },
                        });
                    }
                }
                // 3. Log success in AuditLog
                yield tx.auditLog.create({
                    data: {
                        action: 'INVENTORY_DEDUCTION_SUCCESS',
                        entityType: 'ORDER',
                        entityId: orderId,
                        metadata: { restaurantId },
                    },
                });
            }));
        });
    }
}
exports.DeductionQueueService = DeductionQueueService;
DeductionQueueService.queue = [];
DeductionQueueService.isProcessing = false;
//# sourceMappingURL=deduction-queue.service.js.map