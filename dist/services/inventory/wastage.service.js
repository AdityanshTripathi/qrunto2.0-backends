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
exports.WastageService = void 0;
const prisma_1 = require("../../lib/prisma");
const client_1 = require("@prisma/client");
class WastageService {
    getWastageRecords(restaurantId) {
        return __awaiter(this, void 0, void 0, function* () {
            return prisma_1.prisma.wastageRecord.findMany({
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
        });
    }
    createWastageRecord(restaurantId, userId, data) {
        return __awaiter(this, void 0, void 0, function* () {
            return prisma_1.prisma.$transaction((tx) => __awaiter(this, void 0, void 0, function* () {
                // 1. Fetch raw material to get current stock and average cost
                const material = yield tx.rawMaterial.findFirst({
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
                yield tx.rawMaterial.update({
                    where: { id: data.rawMaterialId },
                    data: { currentStock: newStock },
                });
                // 3. Write to Stock Ledger
                yield tx.stockLedger.create({
                    data: {
                        restaurantId,
                        rawMaterialId: data.rawMaterialId,
                        userId,
                        quantity: -data.quantity,
                        previousStock,
                        newStock,
                        actionType: client_1.LedgerActionType.WASTAGE_RECORD,
                        reason: `Wastage record: ${data.reason}. ${data.notes || ''}`,
                    },
                });
                // 4. Create Wastage Record
                const record = yield tx.wastageRecord.create({
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
            }));
        });
    }
}
exports.WastageService = WastageService;
//# sourceMappingURL=wastage.service.js.map