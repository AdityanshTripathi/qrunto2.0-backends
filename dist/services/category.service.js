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
exports.CategoryService = void 0;
const category_repository_1 = require("../repositories/category.repository");
const categoryRepository = new category_repository_1.CategoryRepository();
class CategoryService {
    getCategories(restaurantId) {
        return __awaiter(this, void 0, void 0, function* () {
            return categoryRepository.findMany(restaurantId);
        });
    }
    getActiveCategories(restaurantId) {
        return __awaiter(this, void 0, void 0, function* () {
            return categoryRepository.findActive(restaurantId);
        });
    }
    createCategory(restaurantId, data) {
        return __awaiter(this, void 0, void 0, function* () {
            let order = data.displayOrder;
            // If displayOrder is not provided, append it to the end
            if (order === undefined) {
                const existing = yield categoryRepository.findMany(restaurantId);
                order = existing.length > 0
                    ? Math.max(...existing.map(c => c.displayOrder)) + 1
                    : 1;
            }
            return categoryRepository.create({
                restaurantId,
                name: data.name,
                displayOrder: order,
                isActive: true,
            });
        });
    }
    updateCategory(id, restaurantId, data) {
        return __awaiter(this, void 0, void 0, function* () {
            // 1. Verify existence and ownership
            const category = yield categoryRepository.findById(id, restaurantId);
            if (!category) {
                throw new Error('Category not found or unauthorized');
            }
            // 2. Perform scoped update
            return categoryRepository.update(id, restaurantId, data);
        });
    }
    deleteCategory(id, restaurantId) {
        return __awaiter(this, void 0, void 0, function* () {
            // 1. Verify existence and ownership
            const category = yield categoryRepository.findById(id, restaurantId);
            if (!category) {
                throw new Error('Category not found or unauthorized');
            }
            // 2. Perform soft delete
            return categoryRepository.softDelete(id, restaurantId);
        });
    }
}
exports.CategoryService = CategoryService;
//# sourceMappingURL=category.service.js.map