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
exports.AuditService = void 0;
const prisma_1 = require("../../lib/prisma");
const client_1 = require("@prisma/client");
class AuditService {
    getAudits(restaurantId) {
        return __awaiter(this, void 0, void 0, function* () {
            return prisma_1.prisma.stockAudit.findMany({
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
        });
    }
    createAudit(restaurantId, userId, data) {
        return __awaiter(this, void 0, void 0, function* () {
            return prisma_1.prisma.$transaction((tx) => __awaiter(this, void 0, void 0, function* () {
                // 1. Create StockAudit header
                const audit = yield tx.stockAudit.create({
                    data: {
                        restaurantId,
                        userId,
                        notes: data.notes || null,
                    },
                });
                // 2. Process each audit item
                for (const item of data.items) {
                    const material = yield tx.rawMaterial.findFirst({
                        where: { id: item.rawMaterialId, restaurantId },
                    });
                    if (!material) {
                        throw new Error(`Raw material ${item.rawMaterialId} not found`);
                    }
                    const expectedStock = material.currentStock;
                    const actualStock = item.actualStock;
                    const variance = actualStock - expectedStock;
                    // Create StockAuditItem
                    yield tx.stockAuditItem.create({
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
                        yield tx.rawMaterial.update({
                            where: { id: item.rawMaterialId },
                            data: { currentStock: actualStock },
                        });
                        yield tx.stockLedger.create({
                            data: {
                                restaurantId,
                                rawMaterialId: item.rawMaterialId,
                                userId,
                                quantity: variance,
                                previousStock: expectedStock,
                                newStock: actualStock,
                                actionType: client_1.LedgerActionType.PHYSICAL_AUDIT,
                                reason: `Physical audit: expected ${expectedStock}, actual ${actualStock}. Variance: ${variance}. Notes: ${item.notes || ''}`,
                            },
                        });
                    }
                }
                // Re-fetch audit with detailed items
                const result = yield tx.stockAudit.findUnique({
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
            }));
        });
    }
}
exports.AuditService = AuditService;
//# sourceMappingURL=audit.service.js.map