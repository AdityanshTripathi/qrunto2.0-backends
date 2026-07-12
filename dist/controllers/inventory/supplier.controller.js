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
exports.SupplierController = void 0;
const zod_1 = require("zod");
const supplier_service_1 = require("../../services/inventory/supplier.service");
const supplierService = new supplier_service_1.SupplierService();
const CreateSupplierSchema = zod_1.z.object({
    name: zod_1.z.string().min(1, 'Supplier name is required').max(100),
    contactName: zod_1.z.string().max(100).optional(),
    phone: zod_1.z.string().min(5, 'Phone number is required').max(20),
    email: zod_1.z.string().email('Invalid email address').or(zod_1.z.literal('')).optional(),
    gstNumber: zod_1.z.string().max(20).optional(),
    address: zod_1.z.string().max(500).optional(),
    creditDays: zod_1.z.number().int().nonnegative().optional(),
    outstandingBalance: zod_1.z.number().optional(),
    isActive: zod_1.z.boolean().optional(),
});
const UpdateSupplierSchema = CreateSupplierSchema.partial();
class SupplierController {
    getSuppliers(req, res) {
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
                const suppliers = yield supplierService.getSuppliers(restaurantId);
                res.status(200).json({ suppliers });
            }
            catch (err) {
                res.status(500).json({ error: err.message });
            }
        });
    }
    getSupplierById(req, res) {
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
                const supplier = yield supplierService.getSupplierById(id, restaurantId);
                if (!supplier) {
                    res.status(404).json({ error: 'Supplier not found' });
                    return;
                }
                res.status(200).json({ supplier });
            }
            catch (err) {
                res.status(500).json({ error: err.message });
            }
        });
    }
    createSupplier(req, res) {
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
                const validationResult = CreateSupplierSchema.safeParse(req.body);
                if (!validationResult.success) {
                    res.status(400).json({ errors: validationResult.error.flatten().fieldErrors });
                    return;
                }
                const data = validationResult.data;
                const payload = {
                    name: data.name,
                    phone: data.phone,
                };
                if (data.contactName !== undefined)
                    payload.contactName = data.contactName;
                if (data.email !== undefined)
                    payload.email = data.email || null;
                if (data.gstNumber !== undefined)
                    payload.gstNumber = data.gstNumber;
                if (data.address !== undefined)
                    payload.address = data.address;
                if (data.creditDays !== undefined)
                    payload.creditDays = data.creditDays;
                if (data.outstandingBalance !== undefined)
                    payload.outstandingBalance = data.outstandingBalance;
                if (data.isActive !== undefined)
                    payload.isActive = data.isActive;
                const supplier = yield supplierService.createSupplier(restaurantId, payload);
                res.status(201).json({ supplier });
            }
            catch (err) {
                res.status(400).json({ error: err.message });
            }
        });
    }
    updateSupplier(req, res) {
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
                const validationResult = UpdateSupplierSchema.safeParse(req.body);
                if (!validationResult.success) {
                    res.status(400).json({ errors: validationResult.error.flatten().fieldErrors });
                    return;
                }
                const data = validationResult.data;
                const payload = {};
                if (data.name !== undefined)
                    payload.name = data.name;
                if (data.contactName !== undefined)
                    payload.contactName = data.contactName;
                if (data.phone !== undefined)
                    payload.phone = data.phone;
                if (data.email !== undefined)
                    payload.email = data.email || null;
                if (data.gstNumber !== undefined)
                    payload.gstNumber = data.gstNumber;
                if (data.address !== undefined)
                    payload.address = data.address;
                if (data.creditDays !== undefined)
                    payload.creditDays = data.creditDays;
                if (data.outstandingBalance !== undefined)
                    payload.outstandingBalance = data.outstandingBalance;
                if (data.isActive !== undefined)
                    payload.isActive = data.isActive;
                const supplier = yield supplierService.updateSupplier(id, restaurantId, payload);
                res.status(200).json({ supplier });
            }
            catch (err) {
                res.status(400).json({ error: err.message });
            }
        });
    }
    deleteSupplier(req, res) {
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
                const supplier = yield supplierService.deleteSupplier(id, restaurantId);
                res.status(200).json({ supplier, message: 'Supplier deactivated successfully' });
            }
            catch (err) {
                res.status(400).json({ error: err.message });
            }
        });
    }
}
exports.SupplierController = SupplierController;
//# sourceMappingURL=supplier.controller.js.map