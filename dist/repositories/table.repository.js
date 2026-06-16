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
exports.TableRepository = void 0;
const prisma_1 = require("../lib/prisma");
class TableRepository {
    findMany(restaurantId) {
        return __awaiter(this, void 0, void 0, function* () {
            return prisma_1.prisma.restaurantTable.findMany({
                where: { restaurantId },
                orderBy: { tableNumber: 'asc' },
            });
        });
    }
    findById(id, restaurantId) {
        return __awaiter(this, void 0, void 0, function* () {
            return prisma_1.prisma.restaurantTable.findFirst({
                where: { id, restaurantId },
            });
        });
    }
    findByTableNumber(tableNumber, restaurantId) {
        return __awaiter(this, void 0, void 0, function* () {
            return prisma_1.prisma.restaurantTable.findFirst({
                where: { tableNumber, restaurantId },
            });
        });
    }
    count(restaurantId) {
        return __awaiter(this, void 0, void 0, function* () {
            return prisma_1.prisma.restaurantTable.count({
                where: { restaurantId },
            });
        });
    }
    create(data) {
        return __awaiter(this, void 0, void 0, function* () {
            return prisma_1.prisma.restaurantTable.create({ data });
        });
    }
    update(id, restaurantId, data) {
        return __awaiter(this, void 0, void 0, function* () {
            yield prisma_1.prisma.restaurantTable.updateMany({
                where: { id, restaurantId },
                data,
            });
            const updated = yield this.findById(id, restaurantId);
            if (!updated)
                throw new Error('Table not found or unauthorized');
            return updated;
        });
    }
    softDelete(id, restaurantId) {
        return __awaiter(this, void 0, void 0, function* () {
            return this.update(id, restaurantId, { isActive: false });
        });
    }
}
exports.TableRepository = TableRepository;
//# sourceMappingURL=table.repository.js.map