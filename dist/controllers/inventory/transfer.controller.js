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
exports.TransferController = void 0;
const zod_1 = require("zod");
const transfer_service_1 = require("../../services/inventory/transfer.service");
const transferService = new transfer_service_1.TransferService();
const CreateTransferItemSchema = zod_1.z.object({
    rawMaterialId: zod_1.z.string().uuid('Invalid raw material ID'),
    quantity: zod_1.z.number().positive('Quantity must be greater than 0'),
});
const CreateTransferSchema = zod_1.z.object({
    destBranchId: zod_1.z.string().uuid('Invalid destination branch ID'),
    notes: zod_1.z.string().max(1000).optional().nullable(),
    items: zod_1.z.array(CreateTransferItemSchema).min(1, 'At least one item must be transferred'),
});
class TransferController {
    getTransfers(req, res) {
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
                const transfers = yield transferService.getTransfers(restaurantId);
                res.status(200).json({ transfers });
            }
            catch (err) {
                res.status(500).json({ error: err.message });
            }
        });
    }
    createTransfer(req, res) {
        return __awaiter(this, void 0, void 0, function* () {
            try {
                if (!req.user) {
                    res.status(401).json({ error: 'Authentication required' });
                    return;
                }
                const sourceBranchId = req.user.restaurantId;
                const userId = req.user.id;
                if (!sourceBranchId) {
                    res.status(400).json({ error: 'No restaurant associated with this session' });
                    return;
                }
                const validationResult = CreateTransferSchema.safeParse(req.body);
                if (!validationResult.success) {
                    res.status(400).json({ errors: validationResult.error.flatten().fieldErrors });
                    return;
                }
                const data = validationResult.data;
                const payload = {
                    destBranchId: data.destBranchId,
                    items: data.items,
                };
                if (data.notes !== undefined && data.notes !== null) {
                    payload.notes = data.notes;
                }
                const transfer = yield transferService.createTransfer(sourceBranchId, userId, payload);
                res.status(201).json({ transfer, message: 'Stock transfer request initiated successfully' });
            }
            catch (err) {
                res.status(400).json({ error: err.message });
            }
        });
    }
    approveTransfer(req, res) {
        return __awaiter(this, void 0, void 0, function* () {
            try {
                if (!req.user) {
                    res.status(401).json({ error: 'Authentication required' });
                    return;
                }
                const destBranchId = req.user.restaurantId;
                const userId = req.user.id;
                if (!destBranchId) {
                    res.status(400).json({ error: 'No restaurant associated with this session' });
                    return;
                }
                const id = req.params['id'];
                const transfer = yield transferService.approveTransfer(id, destBranchId, userId);
                res.status(200).json({ transfer, message: 'Stock transfer approved and received successfully' });
            }
            catch (err) {
                res.status(400).json({ error: err.message });
            }
        });
    }
    rejectTransfer(req, res) {
        return __awaiter(this, void 0, void 0, function* () {
            try {
                if (!req.user) {
                    res.status(401).json({ error: 'Authentication required' });
                    return;
                }
                const destBranchId = req.user.restaurantId;
                const userId = req.user.id;
                if (!destBranchId) {
                    res.status(400).json({ error: 'No restaurant associated with this session' });
                    return;
                }
                const id = req.params['id'];
                const transfer = yield transferService.rejectTransfer(id, destBranchId, userId);
                res.status(200).json({ transfer, message: 'Stock transfer rejected and stock returned successfully' });
            }
            catch (err) {
                res.status(400).json({ error: err.message });
            }
        });
    }
}
exports.TransferController = TransferController;
//# sourceMappingURL=transfer.controller.js.map