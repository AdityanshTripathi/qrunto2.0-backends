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
var __rest = (this && this.__rest) || function (s, e) {
    var t = {};
    for (var p in s) if (Object.prototype.hasOwnProperty.call(s, p) && e.indexOf(p) < 0)
        t[p] = s[p];
    if (s != null && typeof Object.getOwnPropertySymbols === "function")
        for (var i = 0, p = Object.getOwnPropertySymbols(s); i < p.length; i++) {
            if (e.indexOf(p[i]) < 0 && Object.prototype.propertyIsEnumerable.call(s, p[i]))
                t[p[i]] = s[p[i]];
        }
    return t;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.PurchaseRepository = void 0;
const prisma_1 = require("../../lib/prisma");
const client_1 = require("@prisma/client");
class PurchaseRepository {
    findMany(restaurantId) {
        return __awaiter(this, void 0, void 0, function* () {
            return prisma_1.prisma.purchaseOrder.findMany({
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
        });
    }
    findById(id, restaurantId) {
        return __awaiter(this, void 0, void 0, function* () {
            return prisma_1.prisma.purchaseOrder.findFirst({
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
        });
    }
    create(restaurantId, data) {
        return __awaiter(this, void 0, void 0, function* () {
            return prisma_1.prisma.$transaction((tx) => __awaiter(this, void 0, void 0, function* () {
                const { items } = data, poData = __rest(data, ["items"]);
                const purchaseOrder = yield tx.purchaseOrder.create({
                    data: {
                        restaurantId,
                        supplierId: poData.supplierId,
                        poNumber: poData.poNumber,
                        status: poData.status || client_1.PurchaseOrderStatus.DRAFT,
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
            }));
        });
    }
    update(id, restaurantId, data) {
        return __awaiter(this, void 0, void 0, function* () {
            return prisma_1.prisma.$transaction((tx) => __awaiter(this, void 0, void 0, function* () {
                const { items } = data, poData = __rest(data, ["items"]);
                // Check if PO exists and is not already RECEIVED
                const existing = yield tx.purchaseOrder.findFirst({
                    where: { id, restaurantId },
                });
                if (!existing) {
                    throw new Error('Purchase order not found or unauthorized');
                }
                if (existing.status === client_1.PurchaseOrderStatus.RECEIVED) {
                    throw new Error('Cannot update a received purchase order');
                }
                // If items are provided, delete old ones and recreate
                if (items) {
                    yield tx.purchaseOrderItem.deleteMany({
                        where: { poId: id },
                    });
                    yield tx.purchaseOrder.update({
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
                        },
                    });
                }
                else {
                    yield tx.purchaseOrder.update({
                        where: { id },
                        data: poData,
                    });
                }
                const updated = yield tx.purchaseOrder.findUnique({
                    where: { id },
                });
                if (!updated) {
                    throw new Error('Purchase order not found after update');
                }
                return updated;
            }));
        });
    }
    receive(id, restaurantId, data) {
        return __awaiter(this, void 0, void 0, function* () {
            return prisma_1.prisma.$transaction((tx) => __awaiter(this, void 0, void 0, function* () {
                // 1. Fetch the Purchase Order with items
                const po = yield tx.purchaseOrder.findFirst({
                    where: { id, restaurantId },
                    include: { items: true },
                });
                if (!po) {
                    throw new Error('Purchase order not found or unauthorized');
                }
                if (po.status === client_1.PurchaseOrderStatus.RECEIVED) {
                    throw new Error('Purchase order has already been received');
                }
                // 2. Process each item to update stock, average cost and log batches
                for (const item of po.items) {
                    const material = yield tx.rawMaterial.findFirst({
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
                    }
                    else {
                        newAverageCost = unitPrice;
                    }
                    // Update Raw Material
                    yield tx.rawMaterial.update({
                        where: { id: item.rawMaterialId },
                        data: {
                            currentStock: newStock,
                            averageCost: newAverageCost,
                            purchasePrice: unitPrice, // Update last purchase price
                            lastPurchaseDate: data.receivedDate,
                        },
                    });
                    // Write to Stock Ledger
                    yield tx.stockLedger.create({
                        data: {
                            restaurantId,
                            rawMaterialId: item.rawMaterialId,
                            quantity: quantityReceived,
                            previousStock: currentStock,
                            newStock,
                            actionType: client_1.LedgerActionType.PURCHASE_RECEIPT,
                            referenceId: item.id,
                            reason: `Purchase Order ${po.poNumber} receipt`,
                        },
                    });
                    // Write to Stock Batch for expiry tracking
                    const batchExpiry = item.expiryDate || new Date(Date.now() + 365 * 24 * 60 * 60 * 1000); // Default 1 year from now
                    yield tx.stockBatch.create({
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
                yield tx.supplier.update({
                    where: { id: po.supplierId },
                    data: {
                        outstandingBalance: {
                            increment: po.grandTotal,
                        },
                    },
                });
                // 4. Update PO status to RECEIVED
                const updatedPO = yield tx.purchaseOrder.update({
                    where: { id },
                    data: {
                        status: client_1.PurchaseOrderStatus.RECEIVED,
                        receivedDate: data.receivedDate,
                        invoiceNumber: data.invoiceNumber || po.invoiceNumber || null,
                        invoiceAttachmentUrl: data.invoiceAttachmentUrl || po.invoiceAttachmentUrl || null,
                        notes: data.notes || po.notes || null,
                    },
                });
                return updatedPO;
            }));
        });
    }
}
exports.PurchaseRepository = PurchaseRepository;
//# sourceMappingURL=purchase.repository.js.map