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
exports.WastageController = void 0;
const zod_1 = require("zod");
const wastage_service_1 = require("../../services/inventory/wastage.service");
const client_1 = require("@prisma/client");
const wastageService = new wastage_service_1.WastageService();
const CreateWastageRecordSchema = zod_1.z.object({
    rawMaterialId: zod_1.z.string().uuid('Invalid raw material ID'),
    quantity: zod_1.z.number().positive('Quantity must be greater than 0'),
    reason: zod_1.z.nativeEnum(client_1.WastageReason),
    notes: zod_1.z.string().max(1000).optional().nullable(),
    wasteDate: zod_1.z.string().datetime().optional().nullable(),
});
class WastageController {
    getWastageRecords(req, res) {
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
                const wastageRecords = yield wastageService.getWastageRecords(restaurantId);
                res.status(200).json({ wastageRecords });
            }
            catch (err) {
                res.status(500).json({ error: err.message });
            }
        });
    }
    createWastageRecord(req, res) {
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
                const validationResult = CreateWastageRecordSchema.safeParse(req.body);
                if (!validationResult.success) {
                    res.status(400).json({ errors: validationResult.error.flatten().fieldErrors });
                    return;
                }
                const data = validationResult.data;
                const payload = {
                    rawMaterialId: data.rawMaterialId,
                    quantity: data.quantity,
                    reason: data.reason,
                };
                if (data.notes !== undefined && data.notes !== null) {
                    payload.notes = data.notes;
                }
                if (data.wasteDate !== undefined && data.wasteDate !== null) {
                    payload.wasteDate = new Date(data.wasteDate);
                }
                const record = yield wastageService.createWastageRecord(restaurantId, userId, payload);
                res.status(201).json({ record });
            }
            catch (err) {
                res.status(400).json({ error: err.message });
            }
        });
    }
}
exports.WastageController = WastageController;
//# sourceMappingURL=wastage.controller.js.map