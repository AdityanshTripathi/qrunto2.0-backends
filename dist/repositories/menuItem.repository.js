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
exports.MenuItemRepository = void 0;
const prisma_1 = require("../lib/prisma");
class MenuItemRepository {
    findMany(restaurantId, filters) {
        return __awaiter(this, void 0, void 0, function* () {
            const where = { restaurantId };
            if (filters === null || filters === void 0 ? void 0 : filters.categoryId) {
                where.categoryId = filters.categoryId;
            }
            return prisma_1.prisma.menuItem.findMany({
                where,
                include: {
                    category: true,
                },
                orderBy: { name: 'asc' },
            });
        });
    }
    findById(id, restaurantId) {
        return __awaiter(this, void 0, void 0, function* () {
            return prisma_1.prisma.menuItem.findFirst({
                where: { id, restaurantId },
                include: {
                    category: true,
                },
            });
        });
    }
    count(restaurantId) {
        return __awaiter(this, void 0, void 0, function* () {
            return prisma_1.prisma.menuItem.count({
                where: { restaurantId },
            });
        });
    }
    create(data) {
        return __awaiter(this, void 0, void 0, function* () {
            return prisma_1.prisma.menuItem.create({
                data,
                include: {
                    category: true,
                },
            });
        });
    }
    update(id, restaurantId, data) {
        return __awaiter(this, void 0, void 0, function* () {
            yield prisma_1.prisma.menuItem.updateMany({
                where: { id, restaurantId },
                data,
            });
            const updated = yield this.findById(id, restaurantId);
            if (!updated) {
                throw new Error('Menu item not found or unauthorized');
            }
            return updated;
        });
    }
    delete(id, restaurantId) {
        return __awaiter(this, void 0, void 0, function* () {
            const item = yield this.findById(id, restaurantId);
            if (!item) {
                throw new Error('Menu item not found or unauthorized');
            }
            yield prisma_1.prisma.menuItem.delete({
                where: { id },
            });
            return item;
        });
    }
}
exports.MenuItemRepository = MenuItemRepository;
//# sourceMappingURL=menuItem.repository.js.map