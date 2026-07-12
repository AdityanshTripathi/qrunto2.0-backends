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
exports.RawMaterialRepository = void 0;
const prisma_1 = require("../../lib/prisma");
const client_1 = require("@prisma/client");
class RawMaterialRepository {
    findMany(restaurantId, filters) {
        return __awaiter(this, void 0, void 0, function* () {
            const whereClause = { restaurantId };
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
            const items = yield prisma_1.prisma.rawMaterial.findMany({
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
        });
    }
    findById(id, restaurantId) {
        return __awaiter(this, void 0, void 0, function* () {
            return prisma_1.prisma.rawMaterial.findFirst({
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
        });
    }
    create(restaurantId, data) {
        return __awaiter(this, void 0, void 0, function* () {
            // Wrap in transaction to also write an OPENING_STOCK ledger entry if currentStock > 0 or openingStock > 0
            return prisma_1.prisma.$transaction((tx) => __awaiter(this, void 0, void 0, function* () {
                const material = yield tx.rawMaterial.create({
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
                        status: data.status || client_1.RawMaterialStatus.ACTIVE,
                    },
                });
                if (material.currentStock > 0) {
                    yield tx.stockLedger.create({
                        data: {
                            restaurantId,
                            rawMaterialId: material.id,
                            quantity: material.currentStock,
                            previousStock: 0,
                            newStock: material.currentStock,
                            actionType: client_1.LedgerActionType.OPENING_STOCK,
                            reason: 'Initial setup opening stock',
                        },
                    });
                }
                return material;
            }));
        });
    }
    update(id, restaurantId, data) {
        return __awaiter(this, void 0, void 0, function* () {
            yield prisma_1.prisma.rawMaterial.updateMany({
                where: { id, restaurantId },
                data,
            });
            const updated = yield this.findById(id, restaurantId);
            if (!updated) {
                throw new Error('Raw material not found or unauthorized');
            }
            return updated;
        });
    }
    adjustStock(id, restaurantId, quantityChange, userId, actionType, reason) {
        return __awaiter(this, void 0, void 0, function* () {
            return prisma_1.prisma.$transaction((tx) => __awaiter(this, void 0, void 0, function* () {
                const material = yield tx.rawMaterial.findFirst({
                    where: { id, restaurantId },
                });
                if (!material) {
                    throw new Error('Raw material not found or unauthorized');
                }
                const previousStock = material.currentStock;
                const newStock = previousStock + quantityChange;
                yield tx.rawMaterial.update({
                    where: { id },
                    data: { currentStock: newStock },
                });
                yield tx.stockLedger.create({
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
                const updated = yield tx.rawMaterial.findFirst({
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
            }));
        });
    }
    softDelete(id, restaurantId) {
        return __awaiter(this, void 0, void 0, function* () {
            return this.update(id, restaurantId, { status: client_1.RawMaterialStatus.INACTIVE });
        });
    }
}
exports.RawMaterialRepository = RawMaterialRepository;
//# sourceMappingURL=raw-material.repository.js.map