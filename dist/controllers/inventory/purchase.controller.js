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
exports.PurchaseController = void 0;
const zod_1 = require("zod");
const purchase_service_1 = require("../../services/inventory/purchase.service");
const client_1 = require("@prisma/client");
const purchaseService = new purchase_service_1.PurchaseService();
const CreatePurchaseOrderItemSchema = zod_1.z.object({
    rawMaterialId: zod_1.z.string().uuid('Invalid raw material ID'),
    quantity: zod_1.z.number().positive('Quantity must be greater than 0'),
    unitPrice: zod_1.z.number().nonnegative('Unit price cannot be negative'),
    gstPercentage: zod_1.z.number().nonnegative().optional(),
    totalCost: zod_1.z.number().nonnegative(),
    expiryDate: zod_1.z.string().datetime().optional().nullable(),
});
const CreatePurchaseOrderSchema = zod_1.z.object({
    supplierId: zod_1.z.string().uuid('Invalid supplier ID'),
    poNumber: zod_1.z.string().min(1, 'PO number is required'),
    status: zod_1.z.nativeEnum(client_1.PurchaseOrderStatus).optional(),
    orderDate: zod_1.z.string().datetime().optional(),
    expectedDate: zod_1.z.string().datetime().optional().nullable(),
    subtotal: zod_1.z.number().nonnegative(),
    gstAmount: zod_1.z.number().nonnegative(),
    grandTotal: zod_1.z.number().nonnegative(),
    notes: zod_1.z.string().max(1000).optional().nullable(),
    items: zod_1.z.array(CreatePurchaseOrderItemSchema).min(1, 'At least one item is required'),
});
const UpdatePurchaseOrderSchema = CreatePurchaseOrderSchema.partial();
const ReceivePurchaseOrderSchema = zod_1.z.object({
    receivedDate: zod_1.z.string().datetime().optional(),
    invoiceNumber: zod_1.z.string().max(100).optional().nullable(),
    invoiceAttachmentUrl: zod_1.z.string().url().or(zod_1.z.literal('')).optional().nullable(),
    notes: zod_1.z.string().max(1000).optional().nullable(),
});
class PurchaseController {
    getPurchaseOrders(req, res) {
        return __awaiter(this, void 0, void 0, function* () {
            try {
                if (!req.user) {
                    res.status(401).json({ error: 'Authentication required' });
                    return;
                }
                const restaurantId = req.user.restaurantId;
                if (!restaurantId) {
                    res.status(400).json({ error: 'No restaurant associated with this session' });
                    return;
                }
                const purchaseOrders = yield purchaseService.getPurchaseOrders(restaurantId);
                res.status(200).json({ purchaseOrders });
            }
            catch (err) {
                res.status(500).json({ error: err.message });
            }
        });
    }
    getPurchaseOrderById(req, res) {
        return __awaiter(this, void 0, void 0, function* () {
            try {
                if (!req.user) {
                    res.status(401).json({ error: 'Authentication required' });
                    return;
                }
                const restaurantId = req.user.restaurantId;
                if (!restaurantId) {
                    res.status(400).json({ error: 'No restaurant associated with this session' });
                    return;
                }
                const id = req.params['id'];
                const purchaseOrder = yield purchaseService.getPurchaseOrderById(id, restaurantId);
                if (!purchaseOrder) {
                    res.status(404).json({ error: 'Purchase order not found' });
                    return;
                }
                res.status(200).json({ purchaseOrder });
            }
            catch (err) {
                res.status(500).json({ error: err.message });
            }
        });
    }
    createPurchaseOrder(req, res) {
        return __awaiter(this, void 0, void 0, function* () {
            try {
                if (!req.user) {
                    res.status(401).json({ error: 'Authentication required' });
                    return;
                }
                const restaurantId = req.user.restaurantId;
                if (!restaurantId) {
                    res.status(400).json({ error: 'No restaurant associated with this session' });
                    return;
                }
                const validationResult = CreatePurchaseOrderSchema.safeParse(req.body);
                if (!validationResult.success) {
                    res.status(400).json({ errors: validationResult.error.flatten().fieldErrors });
                    return;
                }
                const data = validationResult.data;
                const payload = {
                    supplierId: data.supplierId,
                    poNumber: data.poNumber,
                    subtotal: data.subtotal,
                    gstAmount: data.gstAmount,
                    grandTotal: data.grandTotal,
                    items: data.items.map(item => {
                        const itemPayload = {
                            rawMaterialId: item.rawMaterialId,
                            quantity: item.quantity,
                            unitPrice: item.unitPrice,
                            totalCost: item.totalCost,
                        };
                        if (item.gstPercentage !== undefined)
                            itemPayload.gstPercentage = item.gstPercentage;
                        if (item.expiryDate !== undefined && item.expiryDate !== null)
                            itemPayload.expiryDate = new Date(item.expiryDate);
                        return itemPayload;
                    }),
                };
                if (data.status !== undefined)
                    payload.status = data.status;
                if (data.orderDate !== undefined)
                    payload.orderDate = new Date(data.orderDate);
                if (data.expectedDate !== undefined && data.expectedDate !== null)
                    payload.expectedDate = new Date(data.expectedDate);
                if (data.notes !== undefined && data.notes !== null)
                    payload.notes = data.notes;
                const purchaseOrder = yield purchaseService.createPurchaseOrder(restaurantId, payload);
                res.status(201).json({ purchaseOrder });
            }
            catch (err) {
                res.status(400).json({ error: err.message });
            }
        });
    }
    updatePurchaseOrder(req, res) {
        return __awaiter(this, void 0, void 0, function* () {
            try {
                if (!req.user) {
                    res.status(401).json({ error: 'Authentication required' });
                    return;
                }
                const restaurantId = req.user.restaurantId;
                if (!restaurantId) {
                    res.status(400).json({ error: 'No restaurant associated with this session' });
                    return;
                }
                const id = req.params['id'];
                const validationResult = UpdatePurchaseOrderSchema.safeParse(req.body);
                if (!validationResult.success) {
                    res.status(400).json({ errors: validationResult.error.flatten().fieldErrors });
                    return;
                }
                const data = validationResult.data;
                const payload = {};
                if (data.supplierId !== undefined)
                    payload.supplierId = data.supplierId;
                if (data.poNumber !== undefined)
                    payload.poNumber = data.poNumber;
                if (data.status !== undefined)
                    payload.status = data.status;
                if (data.subtotal !== undefined)
                    payload.subtotal = data.subtotal;
                if (data.gstAmount !== undefined)
                    payload.gstAmount = data.gstAmount;
                if (data.grandTotal !== undefined)
                    payload.grandTotal = data.grandTotal;
                if (data.orderDate !== undefined)
                    payload.orderDate = data.orderDate ? new Date(data.orderDate) : undefined;
                if (data.expectedDate !== undefined)
                    payload.expectedDate = data.expectedDate ? new Date(data.expectedDate) : null;
                if (data.notes !== undefined)
                    payload.notes = data.notes || null;
                if (data.items !== undefined) {
                    payload.items = data.items.map(item => {
                        const itemPayload = {
                            rawMaterialId: item.rawMaterialId,
                            quantity: item.quantity,
                            unitPrice: item.unitPrice,
                            totalCost: item.totalCost,
                        };
                        if (item.gstPercentage !== undefined)
                            itemPayload.gstPercentage = item.gstPercentage;
                        if (item.expiryDate !== undefined)
                            itemPayload.expiryDate = item.expiryDate ? new Date(item.expiryDate) : null;
                        return itemPayload;
                    });
                }
                const purchaseOrder = yield purchaseService.updatePurchaseOrder(id, restaurantId, payload);
                res.status(200).json({ purchaseOrder });
            }
            catch (err) {
                res.status(400).json({ error: err.message });
            }
        });
    }
    receivePurchaseOrder(req, res) {
        return __awaiter(this, void 0, void 0, function* () {
            try {
                if (!req.user) {
                    res.status(401).json({ error: 'Authentication required' });
                    return;
                }
                const restaurantId = req.user.restaurantId;
                if (!restaurantId) {
                    res.status(400).json({ error: 'No restaurant associated with this session' });
                    return;
                }
                const id = req.params['id'];
                const validationResult = ReceivePurchaseOrderSchema.safeParse(req.body);
                if (!validationResult.success) {
                    res.status(400).json({ errors: validationResult.error.flatten().fieldErrors });
                    return;
                }
                const data = validationResult.data;
                const payload = {
                    receivedDate: data.receivedDate ? new Date(data.receivedDate) : new Date(),
                };
                if (data.invoiceNumber !== undefined && data.invoiceNumber !== null)
                    payload.invoiceNumber = data.invoiceNumber;
                if (data.invoiceAttachmentUrl !== undefined && data.invoiceAttachmentUrl !== null)
                    payload.invoiceAttachmentUrl = data.invoiceAttachmentUrl;
                if (data.notes !== undefined && data.notes !== null)
                    payload.notes = data.notes;
                const purchaseOrder = yield purchaseService.receivePurchaseOrder(id, restaurantId, payload);
                res.status(200).json({ purchaseOrder, message: 'Purchase order received and stock levels updated successfully' });
            }
            catch (err) {
                res.status(400).json({ error: err.message });
            }
        });
    }
}
exports.PurchaseController = PurchaseController;
//# sourceMappingURL=purchase.controller.js.map