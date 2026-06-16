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
exports.TableController = void 0;
const zod_1 = require("zod");
const table_service_1 = require("../services/table.service");
const tableService = new table_service_1.TableService();
const CreateTableSchema = zod_1.z.object({
    tableNumber: zod_1.z.string().min(1, 'Table number is required').max(20, 'Table number is too long'),
});
const UpdateTableSchema = zod_1.z.object({
    tableNumber: zod_1.z.string().min(1).max(20).optional(),
    isActive: zod_1.z.boolean().optional(),
});
class TableController {
    getTables(req, res) {
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
                const tables = yield tableService.getTables(restaurantId);
                res.status(200).json({ tables });
            }
            catch (err) {
                res.status(500).json({ error: err.message });
            }
        });
    }
    createTable(req, res) {
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
                const validationResult = CreateTableSchema.safeParse(req.body);
                if (!validationResult.success) {
                    res.status(400).json({ errors: validationResult.error.flatten().fieldErrors });
                    return;
                }
                const table = yield tableService.createTable(restaurantId, validationResult.data.tableNumber);
                res.status(201).json({ table });
            }
            catch (err) {
                res.status(400).json({ error: err.message });
            }
        });
    }
    updateTable(req, res) {
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
                if (!id) {
                    res.status(400).json({ error: 'Table ID is required' });
                    return;
                }
                const validationResult = UpdateTableSchema.safeParse(req.body);
                if (!validationResult.success) {
                    res.status(400).json({ errors: validationResult.error.flatten().fieldErrors });
                    return;
                }
                const payload = {};
                if (validationResult.data.tableNumber !== undefined)
                    payload.tableNumber = validationResult.data.tableNumber;
                if (validationResult.data.isActive !== undefined)
                    payload.isActive = validationResult.data.isActive;
                const table = yield tableService.updateTable(id, restaurantId, payload);
                res.status(200).json({ table });
            }
            catch (err) {
                res.status(400).json({ error: err.message });
            }
        });
    }
    deleteTable(req, res) {
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
                if (!id) {
                    res.status(400).json({ error: 'Table ID is required' });
                    return;
                }
                const table = yield tableService.deleteTable(id, restaurantId);
                res.status(200).json({ table, message: 'Table deactivated successfully' });
            }
            catch (err) {
                res.status(400).json({ error: err.message });
            }
        });
    }
}
exports.TableController = TableController;
//# sourceMappingURL=table.controller.js.map