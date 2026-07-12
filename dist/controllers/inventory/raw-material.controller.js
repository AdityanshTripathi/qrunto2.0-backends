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
exports.RawMaterialController = void 0;
const zod_1 = require("zod");
const raw_material_service_1 = require("../../services/inventory/raw-material.service");
const client_1 = require("@prisma/client");
const rawMaterialService = new raw_material_service_1.RawMaterialService();
const CreateRawMaterialSchema = zod_1.z.object({
    supplierId: zod_1.z.string().uuid('Invalid supplier ID').optional().nullable(),
    name: zod_1.z.string().min(1, 'Name is required').max(100),
    category: zod_1.z.string().min(1, 'Category is required').max(100),
    sku: zod_1.z.string().min(1, 'SKU is required').max(100),
    unit: zod_1.z.string().min(1, 'Unit is required').max(20),
    openingStock: zod_1.z.number().nonnegative(),
    currentStock: zod_1.z.number().nonnegative(),
    minimumStockLevel: zod_1.z.number().nonnegative(),
    maximumStockLevel: zod_1.z.number().nonnegative(),
    reorderQuantity: zod_1.z.number().nonnegative(),
    purchasePrice: zod_1.z.number().nonnegative(),
    averageCost: zod_1.z.number().nonnegative(),
    expiryDate: zod_1.z.string().datetime({ precision: 3 }).or(zod_1.z.string().datetime()).optional().nullable(),
    storageLocation: zod_1.z.string().max(100).optional().nullable(),
    notes: zod_1.z.string().max(1000).optional().nullable(),
    status: zod_1.z.nativeEnum(client_1.RawMaterialStatus).optional(),
});
const UpdateRawMaterialSchema = CreateRawMaterialSchema.partial();
const AdjustStockSchema = zod_1.z.object({
    rawMaterialId: zod_1.z.string().uuid('Invalid raw material ID'),
    quantityChange: zod_1.z.number(),
    actionType: zod_1.z.nativeEnum(client_1.LedgerActionType),
    reason: zod_1.z.string().max(200).optional(),
});
class RawMaterialController {
    getRawMaterials(req, res) {
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
                const { category, status, lowStock } = req.query;
                const filters = {};
                if (category)
                    filters.category = category;
                if (status)
                    filters.status = status;
                if (lowStock === 'true')
                    filters.lowStock = true;
                const rawMaterials = yield rawMaterialService.getRawMaterials(restaurantId, filters);
                res.status(200).json({ rawMaterials });
            }
            catch (err) {
                res.status(500).json({ error: err.message });
            }
        });
    }
    getRawMaterialById(req, res) {
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
                const rawMaterial = yield rawMaterialService.getRawMaterialById(id, restaurantId);
                if (!rawMaterial) {
                    res.status(404).json({ error: 'Raw material not found' });
                    return;
                }
                res.status(200).json({ rawMaterial });
            }
            catch (err) {
                res.status(500).json({ error: err.message });
            }
        });
    }
    createRawMaterial(req, res) {
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
                const validationResult = CreateRawMaterialSchema.safeParse(req.body);
                if (!validationResult.success) {
                    res.status(400).json({ errors: validationResult.error.flatten().fieldErrors });
                    return;
                }
                const data = validationResult.data;
                const payload = {
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
                };
                if (data.supplierId !== undefined && data.supplierId !== null)
                    payload.supplierId = data.supplierId;
                if (data.expiryDate !== undefined && data.expiryDate !== null)
                    payload.expiryDate = new Date(data.expiryDate);
                if (data.storageLocation !== undefined && data.storageLocation !== null)
                    payload.storageLocation = data.storageLocation;
                if (data.notes !== undefined && data.notes !== null)
                    payload.notes = data.notes;
                if (data.status !== undefined)
                    payload.status = data.status;
                const rawMaterial = yield rawMaterialService.createRawMaterial(restaurantId, payload);
                res.status(201).json({ rawMaterial });
            }
            catch (err) {
                res.status(400).json({ error: err.message });
            }
        });
    }
    updateRawMaterial(req, res) {
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
                const validationResult = UpdateRawMaterialSchema.safeParse(req.body);
                if (!validationResult.success) {
                    res.status(400).json({ errors: validationResult.error.flatten().fieldErrors });
                    return;
                }
                const data = validationResult.data;
                const payload = {};
                if (data.name !== undefined)
                    payload.name = data.name;
                if (data.category !== undefined)
                    payload.category = data.category;
                if (data.sku !== undefined)
                    payload.sku = data.sku;
                if (data.unit !== undefined)
                    payload.unit = data.unit;
                if (data.openingStock !== undefined)
                    payload.openingStock = data.openingStock;
                if (data.currentStock !== undefined)
                    payload.currentStock = data.currentStock;
                if (data.minimumStockLevel !== undefined)
                    payload.minimumStockLevel = data.minimumStockLevel;
                if (data.maximumStockLevel !== undefined)
                    payload.maximumStockLevel = data.maximumStockLevel;
                if (data.reorderQuantity !== undefined)
                    payload.reorderQuantity = data.reorderQuantity;
                if (data.purchasePrice !== undefined)
                    payload.purchasePrice = data.purchasePrice;
                if (data.averageCost !== undefined)
                    payload.averageCost = data.averageCost;
                if (data.supplierId !== undefined)
                    payload.supplierId = data.supplierId || null;
                if (data.expiryDate !== undefined)
                    payload.expiryDate = data.expiryDate ? new Date(data.expiryDate) : null;
                if (data.storageLocation !== undefined)
                    payload.storageLocation = data.storageLocation || null;
                if (data.notes !== undefined)
                    payload.notes = data.notes || null;
                if (data.status !== undefined)
                    payload.status = data.status;
                const rawMaterial = yield rawMaterialService.updateRawMaterial(id, restaurantId, payload);
                res.status(200).json({ rawMaterial });
            }
            catch (err) {
                res.status(400).json({ error: err.message });
            }
        });
    }
    adjustStock(req, res) {
        return __awaiter(this, void 0, void 0, function* () {
            try {
                if (!req.user) {
                    res.status(401).json({ error: 'Authentication required' });
                    return;
                }
                const restaurantId = req.user.restaurantId;
                const userId = req.user.id;
                if (!restaurantId) {
                    res.status(400).json({ error: 'No restaurant associated with this session' });
                    return;
                }
                const validationResult = AdjustStockSchema.safeParse(req.body);
                if (!validationResult.success) {
                    res.status(400).json({ errors: validationResult.error.flatten().fieldErrors });
                    return;
                }
                const { rawMaterialId, quantityChange, actionType, reason } = validationResult.data;
                const rawMaterial = yield rawMaterialService.adjustStock(rawMaterialId, restaurantId, quantityChange, userId, actionType, reason);
                res.status(200).json({ rawMaterial, message: 'Stock adjusted successfully' });
            }
            catch (err) {
                res.status(400).json({ error: err.message });
            }
        });
    }
    deleteRawMaterial(req, res) {
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
                const rawMaterial = yield rawMaterialService.deleteRawMaterial(id, restaurantId);
                res.status(200).json({ rawMaterial, message: 'Raw material status set to INACTIVE successfully' });
            }
            catch (err) {
                res.status(400).json({ error: err.message });
            }
        });
    }
}
exports.RawMaterialController = RawMaterialController;
//# sourceMappingURL=raw-material.controller.js.map