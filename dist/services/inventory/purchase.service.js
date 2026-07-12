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
exports.PurchaseService = void 0;
const purchase_repository_1 = require("../../repositories/inventory/purchase.repository");
const supplier_repository_1 = require("../../repositories/inventory/supplier.repository");
const purchaseRepository = new purchase_repository_1.PurchaseRepository();
const supplierRepository = new supplier_repository_1.SupplierRepository();
class PurchaseService {
    getPurchaseOrders(restaurantId) {
        return __awaiter(this, void 0, void 0, function* () {
            return purchaseRepository.findMany(restaurantId);
        });
    }
    getPurchaseOrderById(id, restaurantId) {
        return __awaiter(this, void 0, void 0, function* () {
            return purchaseRepository.findById(id, restaurantId);
        });
    }
    createPurchaseOrder(restaurantId, data) {
        return __awaiter(this, void 0, void 0, function* () {
            // Validate supplier
            const supplier = yield supplierRepository.findById(data.supplierId, restaurantId);
            if (!supplier) {
                throw new Error('Supplier not found or unauthorized');
            }
            return purchaseRepository.create(restaurantId, data);
        });
    }
    updatePurchaseOrder(id, restaurantId, data) {
        return __awaiter(this, void 0, void 0, function* () {
            if (data.supplierId) {
                const supplier = yield supplierRepository.findById(data.supplierId, restaurantId);
                if (!supplier) {
                    throw new Error('Supplier not found or unauthorized');
                }
            }
            return purchaseRepository.update(id, restaurantId, data);
        });
    }
    receivePurchaseOrder(id, restaurantId, data) {
        return __awaiter(this, void 0, void 0, function* () {
            return purchaseRepository.receive(id, restaurantId, data);
        });
    }
}
exports.PurchaseService = PurchaseService;
//# sourceMappingURL=purchase.service.js.map