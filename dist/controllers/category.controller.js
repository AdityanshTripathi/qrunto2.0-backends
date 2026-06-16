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
exports.CategoryController = void 0;
const zod_1 = require("zod");
const category_service_1 = require("../services/category.service");
const categoryService = new category_service_1.CategoryService();
const CreateCategorySchema = zod_1.z.object({
    name: zod_1.z.string().min(1, 'Category name is required').max(100),
    displayOrder: zod_1.z.number().int().optional(),
});
const UpdateCategorySchema = zod_1.z.object({
    name: zod_1.z.string().min(1, 'Category name is required').max(100).optional(),
    displayOrder: zod_1.z.number().int().optional(),
    isActive: zod_1.z.boolean().optional(),
});
class CategoryController {
    getCategories(req, res) {
        return __awaiter(this, void 0, void 0, function* () {
            try {
                if (!req.user) {
                    res.status(401).json({ error: 'Authentication required' });
                    return;
                }
                const restaurantId = req.user.restaurantId;
                if (!restaurantId) {
                    res.status(400).json({ error: 'No restaurant associated with this user session' });
                    return;
                }
                const categories = yield categoryService.getCategories(restaurantId);
                res.status(200).json({ categories });
            }
            catch (err) {
                res.status(500).json({ error: err.message });
            }
        });
    }
    createCategory(req, res) {
        return __awaiter(this, void 0, void 0, function* () {
            try {
                if (!req.user) {
                    res.status(401).json({ error: 'Authentication required' });
                    return;
                }
                const restaurantId = req.user.restaurantId;
                if (!restaurantId) {
                    res.status(400).json({ error: 'No restaurant associated with this user session' });
                    return;
                }
                const validationResult = CreateCategorySchema.safeParse(req.body);
                if (!validationResult.success) {
                    res.status(400).json({ errors: validationResult.error.flatten().fieldErrors });
                    return;
                }
                // Handle exactOptionalPropertyTypes by explicitly building the payload
                const payload = {
                    name: validationResult.data.name,
                };
                if (validationResult.data.displayOrder !== undefined) {
                    payload.displayOrder = validationResult.data.displayOrder;
                }
                const category = yield categoryService.createCategory(restaurantId, payload);
                res.status(201).json({ category });
            }
            catch (err) {
                res.status(400).json({ error: err.message });
            }
        });
    }
    updateCategory(req, res) {
        return __awaiter(this, void 0, void 0, function* () {
            try {
                if (!req.user) {
                    res.status(401).json({ error: 'Authentication required' });
                    return;
                }
                const restaurantId = req.user.restaurantId;
                if (!restaurantId) {
                    res.status(400).json({ error: 'No restaurant associated with this user session' });
                    return;
                }
                const id = req.params['id'];
                if (!id) {
                    res.status(400).json({ error: 'Category ID is required' });
                    return;
                }
                const validationResult = UpdateCategorySchema.safeParse(req.body);
                if (!validationResult.success) {
                    res.status(400).json({ errors: validationResult.error.flatten().fieldErrors });
                    return;
                }
                // Handle exactOptionalPropertyTypes by explicitly building the payload
                const payload = {};
                if (validationResult.data.name !== undefined)
                    payload.name = validationResult.data.name;
                if (validationResult.data.displayOrder !== undefined)
                    payload.displayOrder = validationResult.data.displayOrder;
                if (validationResult.data.isActive !== undefined)
                    payload.isActive = validationResult.data.isActive;
                const category = yield categoryService.updateCategory(id, restaurantId, payload);
                res.status(200).json({ category });
            }
            catch (err) {
                res.status(400).json({ error: err.message });
            }
        });
    }
    deleteCategory(req, res) {
        return __awaiter(this, void 0, void 0, function* () {
            try {
                if (!req.user) {
                    res.status(401).json({ error: 'Authentication required' });
                    return;
                }
                const restaurantId = req.user.restaurantId;
                if (!restaurantId) {
                    res.status(400).json({ error: 'No restaurant associated with this user session' });
                    return;
                }
                const id = req.params['id'];
                if (!id) {
                    res.status(400).json({ error: 'Category ID is required' });
                    return;
                }
                const category = yield categoryService.deleteCategory(id, restaurantId);
                res.status(200).json({ category, message: 'Category soft-deleted successfully' });
            }
            catch (err) {
                res.status(400).json({ error: err.message });
            }
        });
    }
}
exports.CategoryController = CategoryController;
//# sourceMappingURL=category.controller.js.map