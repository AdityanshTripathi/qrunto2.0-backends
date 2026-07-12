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
exports.AuditController = void 0;
const zod_1 = require("zod");
const audit_service_1 = require("../../services/inventory/audit.service");
const auditService = new audit_service_1.AuditService();
const CreateAuditItemSchema = zod_1.z.object({
    rawMaterialId: zod_1.z.string().uuid('Invalid raw material ID'),
    actualStock: zod_1.z.number().nonnegative('Stock count cannot be negative'),
    notes: zod_1.z.string().max(200).optional().nullable(),
});
const CreateAuditSchema = zod_1.z.object({
    notes: zod_1.z.string().max(1000).optional().nullable(),
    items: zod_1.z.array(CreateAuditItemSchema).min(1, 'At least one item must be audited'),
});
class AuditController {
    getAudits(req, res) {
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
                const audits = yield auditService.getAudits(restaurantId);
                res.status(200).json({ audits });
            }
            catch (err) {
                res.status(500).json({ error: err.message });
            }
        });
    }
    createAudit(req, res) {
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
                const validationResult = CreateAuditSchema.safeParse(req.body);
                if (!validationResult.success) {
                    res.status(400).json({ errors: validationResult.error.flatten().fieldErrors });
                    return;
                }
                const data = validationResult.data;
                const payload = {
                    items: data.items.map(item => {
                        const itemPayload = {
                            rawMaterialId: item.rawMaterialId,
                            actualStock: item.actualStock,
                        };
                        if (item.notes !== undefined && item.notes !== null) {
                            itemPayload.notes = item.notes;
                        }
                        return itemPayload;
                    }),
                };
                if (data.notes !== undefined && data.notes !== null) {
                    payload.notes = data.notes;
                }
                const audit = yield auditService.createAudit(restaurantId, userId, payload);
                res.status(201).json({ audit });
            }
            catch (err) {
                res.status(400).json({ error: err.message });
            }
        });
    }
}
exports.AuditController = AuditController;
//# sourceMappingURL=audit.controller.js.map