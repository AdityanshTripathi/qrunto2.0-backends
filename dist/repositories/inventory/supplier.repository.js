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
exports.SupplierRepository = void 0;
const prisma_1 = require("../../lib/prisma");
class SupplierRepository {
    findMany(restaurantId) {
        return __awaiter(this, void 0, void 0, function* () {
            return prisma_1.prisma.supplier.findMany({
                where: { restaurantId },
                orderBy: { name: 'asc' },
            });
        });
    }
    findActive(restaurantId) {
        return __awaiter(this, void 0, void 0, function* () {
            return prisma_1.prisma.supplier.findMany({
                where: {
                    restaurantId,
                    isActive: true,
                },
                orderBy: { name: 'asc' },
            });
        });
    }
    findById(id, restaurantId) {
        return __awaiter(this, void 0, void 0, function* () {
            return prisma_1.prisma.supplier.findFirst({
                where: { id, restaurantId },
            });
        });
    }
    create(restaurantId, data) {
        return __awaiter(this, void 0, void 0, function* () {
            return prisma_1.prisma.supplier.create({
                data: Object.assign(Object.assign({}, data), { restaurantId }),
            });
        });
    }
    update(id, restaurantId, data) {
        return __awaiter(this, void 0, void 0, function* () {
            yield prisma_1.prisma.supplier.updateMany({
                where: { id, restaurantId },
                data,
            });
            const updated = yield this.findById(id, restaurantId);
            if (!updated) {
                throw new Error('Supplier not found or unauthorized');
            }
            return updated;
        });
    }
    softDelete(id, restaurantId) {
        return __awaiter(this, void 0, void 0, function* () {
            return this.update(id, restaurantId, { isActive: false });
        });
    }
}
exports.SupplierRepository = SupplierRepository;
//# sourceMappingURL=supplier.repository.js.map