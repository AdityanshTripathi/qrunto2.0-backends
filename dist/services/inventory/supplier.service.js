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
exports.SupplierService = void 0;
const supplier_repository_1 = require("../../repositories/inventory/supplier.repository");
const supplierRepository = new supplier_repository_1.SupplierRepository();
class SupplierService {
    getSuppliers(restaurantId) {
        return __awaiter(this, void 0, void 0, function* () {
            return supplierRepository.findMany(restaurantId);
        });
    }
    getActiveSuppliers(restaurantId) {
        return __awaiter(this, void 0, void 0, function* () {
            return supplierRepository.findActive(restaurantId);
        });
    }
    getSupplierById(id, restaurantId) {
        return __awaiter(this, void 0, void 0, function* () {
            return supplierRepository.findById(id, restaurantId);
        });
    }
    createSupplier(restaurantId, data) {
        return __awaiter(this, void 0, void 0, function* () {
            return supplierRepository.create(restaurantId, data);
        });
    }
    updateSupplier(id, restaurantId, data) {
        return __awaiter(this, void 0, void 0, function* () {
            return supplierRepository.update(id, restaurantId, data);
        });
    }
    deleteSupplier(id, restaurantId) {
        return __awaiter(this, void 0, void 0, function* () {
            return supplierRepository.softDelete(id, restaurantId);
        });
    }
}
exports.SupplierService = SupplierService;
//# sourceMappingURL=supplier.service.js.map