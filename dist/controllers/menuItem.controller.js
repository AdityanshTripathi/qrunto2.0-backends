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
exports.MenuItemController = void 0;
const zod_1 = require("zod");
const menuItem_service_1 = require("../services/menuItem.service");
const menuItemService = new menuItem_service_1.MenuItemService();
const CreateMenuItemSchema = zod_1.z.object({
    categoryId: zod_1.z.string().uuid('Invalid category ID format'),
    name: zod_1.z.string().min(1, 'Menu item name is required').max(100),
    description: zod_1.z.string().max(500).nullable().optional(),
    price: zod_1.z.number().nonnegative('Price must be a non-negative number'),
    imageUrl: zod_1.z.string().nullable().optional(),
    isAvailable: zod_1.z.boolean().optional(),
    isFeatured: zod_1.z.boolean().optional(),
});
const UpdateMenuItemSchema = zod_1.z.object({
    categoryId: zod_1.z.string().uuid('Invalid category ID format').optional(),
    name: zod_1.z.string().min(1, 'Menu item name is required').max(100).optional(),
    description: zod_1.z.string().max(500).nullable().optional(),
    price: zod_1.z.number().nonnegative('Price must be a non-negative number').optional(),
    imageUrl: zod_1.z.string().nullable().optional(),
    isAvailable: zod_1.z.boolean().optional(),
    isFeatured: zod_1.z.boolean().optional(),
});
class MenuItemController {
    getMenuItems(req, res) {
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
                const categoryId = req.query['categoryId'];
                const filters = categoryId ? { categoryId } : undefined;
                const menuItems = yield menuItemService.getMenuItems(restaurantId, filters);
                res.status(200).json({ menuItems });
            }
            catch (err) {
                res.status(500).json({ error: err.message });
            }
        });
    }
    getMenuItemById(req, res) {
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
                    res.status(400).json({ error: 'Menu item ID is required' });
                    return;
                }
                const menuItem = yield menuItemService.getMenuItemById(id, restaurantId);
                if (!menuItem) {
                    res.status(404).json({ error: 'Menu item not found' });
                    return;
                }
                res.status(200).json({ menuItem });
            }
            catch (err) {
                res.status(500).json({ error: err.message });
            }
        });
    }
    createMenuItem(req, res) {
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
                const validationResult = CreateMenuItemSchema.safeParse(req.body);
                if (!validationResult.success) {
                    res.status(400).json({ errors: validationResult.error.flatten().fieldErrors });
                    return;
                }
                // Handle exactOptionalPropertyTypes by explicitly building the payload
                const data = validationResult.data;
                const payload = {
                    categoryId: data.categoryId,
                    name: data.name,
                    price: data.price,
                };
                if (data.description !== undefined)
                    payload.description = data.description;
                if (data.imageUrl !== undefined)
                    payload.imageUrl = data.imageUrl;
                if (data.isAvailable !== undefined)
                    payload.isAvailable = data.isAvailable;
                if (data.isFeatured !== undefined)
                    payload.isFeatured = data.isFeatured;
                const menuItem = yield menuItemService.createMenuItem(restaurantId, payload);
                res.status(201).json({ menuItem });
            }
            catch (err) {
                res.status(400).json({ error: err.message });
            }
        });
    }
    updateMenuItem(req, res) {
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
                    res.status(400).json({ error: 'Menu item ID is required' });
                    return;
                }
                const validationResult = UpdateMenuItemSchema.safeParse(req.body);
                if (!validationResult.success) {
                    res.status(400).json({ errors: validationResult.error.flatten().fieldErrors });
                    return;
                }
                // Handle exactOptionalPropertyTypes by explicitly building the payload
                const data = validationResult.data;
                const payload = {};
                if (data.categoryId !== undefined)
                    payload.categoryId = data.categoryId;
                if (data.name !== undefined)
                    payload.name = data.name;
                if (data.description !== undefined)
                    payload.description = data.description;
                if (data.price !== undefined)
                    payload.price = data.price;
                if (data.imageUrl !== undefined)
                    payload.imageUrl = data.imageUrl;
                if (data.isAvailable !== undefined)
                    payload.isAvailable = data.isAvailable;
                if (data.isFeatured !== undefined)
                    payload.isFeatured = data.isFeatured;
                const menuItem = yield menuItemService.updateMenuItem(id, restaurantId, payload);
                res.status(200).json({ menuItem });
            }
            catch (err) {
                res.status(400).json({ error: err.message });
            }
        });
    }
    deleteMenuItem(req, res) {
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
                    res.status(400).json({ error: 'Menu item ID is required' });
                    return;
                }
                const menuItem = yield menuItemService.deleteMenuItem(id, restaurantId);
                res.status(200).json({ menuItem, message: 'Menu item deleted successfully' });
            }
            catch (err) {
                res.status(400).json({ error: err.message });
            }
        });
    }
}
exports.MenuItemController = MenuItemController;
//# sourceMappingURL=menuItem.controller.js.map