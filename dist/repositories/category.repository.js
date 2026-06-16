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
exports.CategoryRepository = void 0;
const prisma_1 = require("../lib/prisma");
class CategoryRepository {
    findMany(restaurantId) {
        return __awaiter(this, void 0, void 0, function* () {
            return prisma_1.prisma.category.findMany({
                where: { restaurantId },
                orderBy: { displayOrder: 'asc' },
            });
        });
    }
    findActive(restaurantId) {
        return __awaiter(this, void 0, void 0, function* () {
            return prisma_1.prisma.category.findMany({
                where: {
                    restaurantId,
                    isActive: true,
                },
                orderBy: { displayOrder: 'asc' },
            });
        });
    }
    findById(id, restaurantId) {
        return __awaiter(this, void 0, void 0, function* () {
            return prisma_1.prisma.category.findFirst({
                where: { id, restaurantId },
            });
        });
    }
    create(data) {
        return __awaiter(this, void 0, void 0, function* () {
            return prisma_1.prisma.category.create({
                data,
            });
        });
    }
    update(id, restaurantId, data) {
        return __awaiter(this, void 0, void 0, function* () {
            // Note: Scoped update using updateMany to ensure multi-tenant security,
            // then fetch the updated object. This is a robust way to prevent cross-tenant writes!
            yield prisma_1.prisma.category.updateMany({
                where: { id, restaurantId },
                data,
            });
            const updated = yield this.findById(id, restaurantId);
            if (!updated) {
                throw new Error('Category not found or unauthorized');
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
exports.CategoryRepository = CategoryRepository;
//# sourceMappingURL=category.repository.js.map