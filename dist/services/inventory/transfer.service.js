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
exports.TransferService = void 0;
const prisma_1 = require("../../lib/prisma");
const client_1 = require("@prisma/client");
class TransferService {
    getTransfers(restaurantId) {
        return __awaiter(this, void 0, void 0, function* () {
            return prisma_1.prisma.stockTransfer.findMany({
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
        });
    }
    createTransfer(sourceBranchId, userId, data) {
        return __awaiter(this, void 0, void 0, function* () {
            return prisma_1.prisma.$transaction((tx) => __awaiter(this, void 0, void 0, function* () {
                // 1. Fetch Source Branch to verify brandId
                const sourceBranch = yield tx.restaurant.findUnique({
                    where: { id: sourceBranchId },
                    select: { brandId: true, name: true },
                });
                if (!sourceBranch || !sourceBranch.brandId) {
                    throw new Error('Source branch not found or has no brand associated');
                }
                // Verify Dest Branch belongs to the same brand
                const destBranch = yield tx.restaurant.findFirst({
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
                const transfer = yield tx.stockTransfer.create({
                    data: {
                        brandId: sourceBranch.brandId,
                        sourceBranchId,
                        destBranchId: data.destBranchId,
                        transferNumber,
                        notes: data.notes || null,
                        createdById: userId,
                        status: client_1.TransferStatus.PENDING,
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
                    const material = yield tx.rawMaterial.findFirst({
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
                    yield tx.rawMaterial.update({
                        where: { id: item.rawMaterialId },
                        data: { currentStock: newStock },
                    });
                    yield tx.stockLedger.create({
                        data: {
                            restaurantId: sourceBranchId,
                            rawMaterialId: item.rawMaterialId,
                            userId,
                            quantity: -item.quantity,
                            previousStock,
                            newStock,
                            actionType: client_1.LedgerActionType.TRANSFER_OUT,
                            referenceId: transfer.id,
                            reason: `Transfer #${transferNumber} to ${destBranch.name}`,
                        },
                    });
                }
                return transfer;
            }));
        });
    }
    approveTransfer(id, destBranchId, userId) {
        return __awaiter(this, void 0, void 0, function* () {
            return prisma_1.prisma.$transaction((tx) => __awaiter(this, void 0, void 0, function* () {
                // 1. Fetch Transfer
                const transfer = yield tx.stockTransfer.findFirst({
                    where: { id, destBranchId },
                    include: { items: { include: { rawMaterial: true } } },
                });
                if (!transfer) {
                    throw new Error('Transfer request not found or unauthorized');
                }
                if (transfer.status !== client_1.TransferStatus.PENDING) {
                    throw new Error(`Cannot approve a transfer with status ${transfer.status}`);
                }
                // 2. Add stock and update average cost at destination branch
                for (const item of transfer.items) {
                    const sourceMaterial = item.rawMaterial;
                    // Find or create RawMaterial at destination branch by SKU
                    let destMaterial = yield tx.rawMaterial.findFirst({
                        where: { sku: sourceMaterial.sku, restaurantId: destBranchId },
                    });
                    if (!destMaterial) {
                        // Create the raw material at destination
                        destMaterial = yield tx.rawMaterial.create({
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
                                status: client_1.RawMaterialStatus.ACTIVE,
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
                    yield tx.rawMaterial.update({
                        where: { id: destMaterial.id },
                        data: {
                            currentStock: newStock,
                            averageCost: newAverageCost,
                        },
                    });
                    // Write ledger entry at destination
                    yield tx.stockLedger.create({
                        data: {
                            restaurantId: destBranchId,
                            rawMaterialId: destMaterial.id,
                            userId,
                            quantity: item.quantity,
                            previousStock,
                            newStock,
                            actionType: client_1.LedgerActionType.TRANSFER_IN,
                            referenceId: transfer.id,
                            reason: `Transfer #${transfer.transferNumber} received`,
                        },
                    });
                }
                // 3. Mark Transfer as COMPLETED
                const updated = yield tx.stockTransfer.update({
                    where: { id },
                    data: {
                        status: client_1.TransferStatus.COMPLETED,
                        approvedById: userId,
                        receivedDate: new Date(),
                    },
                });
                return updated;
            }));
        });
    }
    rejectTransfer(id, destBranchId, userId) {
        return __awaiter(this, void 0, void 0, function* () {
            return prisma_1.prisma.$transaction((tx) => __awaiter(this, void 0, void 0, function* () {
                // 1. Fetch Transfer
                const transfer = yield tx.stockTransfer.findFirst({
                    where: { id, destBranchId },
                    include: { items: { include: { rawMaterial: true } } },
                });
                if (!transfer) {
                    throw new Error('Transfer request not found or unauthorized');
                }
                if (transfer.status !== client_1.TransferStatus.PENDING) {
                    throw new Error(`Cannot reject a transfer with status ${transfer.status}`);
                }
                // 2. Return reserved stock back to source branch
                for (const item of transfer.items) {
                    const material = yield tx.rawMaterial.findFirst({
                        where: { id: item.rawMaterialId, restaurantId: transfer.sourceBranchId },
                    });
                    if (!material) {
                        throw new Error(`Raw material ${item.rawMaterialId} not found in source branch during rollback`);
                    }
                    const previousStock = material.currentStock;
                    const newStock = previousStock + item.quantity;
                    yield tx.rawMaterial.update({
                        where: { id: item.rawMaterialId },
                        data: { currentStock: newStock },
                    });
                    // Write ledger adjustment entry at source
                    yield tx.stockLedger.create({
                        data: {
                            restaurantId: transfer.sourceBranchId,
                            rawMaterialId: item.rawMaterialId,
                            userId,
                            quantity: item.quantity,
                            previousStock,
                            newStock,
                            actionType: client_1.LedgerActionType.MANUAL_ADJUSTMENT,
                            referenceId: transfer.id,
                            reason: `Transfer #${transfer.transferNumber} rejected - stock returned`,
                        },
                    });
                }
                // 3. Mark Transfer as REJECTED
                const updated = yield tx.stockTransfer.update({
                    where: { id },
                    data: {
                        status: client_1.TransferStatus.REJECTED,
                        approvedById: userId,
                    },
                });
                return updated;
            }));
        });
    }
}
exports.TransferService = TransferService;
//# sourceMappingURL=transfer.service.js.map