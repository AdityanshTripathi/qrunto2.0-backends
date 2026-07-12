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
exports.RawMaterialService = void 0;
const raw_material_repository_1 = require("../../repositories/inventory/raw-material.repository");
const supplier_repository_1 = require("../../repositories/inventory/supplier.repository");
const rawMaterialRepository = new raw_material_repository_1.RawMaterialRepository();
const supplierRepository = new supplier_repository_1.SupplierRepository();
class RawMaterialService {
    getRawMaterials(restaurantId, filters) {
        return __awaiter(this, void 0, void 0, function* () {
            return rawMaterialRepository.findMany(restaurantId, filters);
        });
    }
    getRawMaterialById(id, restaurantId) {
        return __awaiter(this, void 0, void 0, function* () {
            return rawMaterialRepository.findById(id, restaurantId);
        });
    }
    createRawMaterial(restaurantId, data) {
        return __awaiter(this, void 0, void 0, function* () {
            if (data.supplierId) {
                const supplier = yield supplierRepository.findById(data.supplierId, restaurantId);
                if (!supplier) {
                    throw new Error('Supplier not found or unauthorized');
                }
            }
            return rawMaterialRepository.create(restaurantId, data);
        });
    }
    updateRawMaterial(id, restaurantId, data) {
        return __awaiter(this, void 0, void 0, function* () {
            if (data.supplierId) {
                const supplier = yield supplierRepository.findById(data.supplierId, restaurantId);
                if (!supplier) {
                    throw new Error('Supplier not found or unauthorized');
                }
            }
            return rawMaterialRepository.update(id, restaurantId, data);
        });
    }
    adjustStock(id, restaurantId, quantityChange, userId, actionType, reason) {
        return __awaiter(this, void 0, void 0, function* () {
            return rawMaterialRepository.adjustStock(id, restaurantId, quantityChange, userId, actionType, reason);
        });
    }
    deleteRawMaterial(id, restaurantId) {
        return __awaiter(this, void 0, void 0, function* () {
            return rawMaterialRepository.softDelete(id, restaurantId);
        });
    }
}
exports.RawMaterialService = RawMaterialService;
//# sourceMappingURL=raw-material.service.js.map