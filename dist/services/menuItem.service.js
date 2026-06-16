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
exports.MenuItemService = void 0;
const menuItem_repository_1 = require("../repositories/menuItem.repository");
const category_repository_1 = require("../repositories/category.repository");
const subscription_repository_1 = require("../repositories/subscription.repository");
const menuItemRepository = new menuItem_repository_1.MenuItemRepository();
const categoryRepository = new category_repository_1.CategoryRepository();
const subscriptionRepository = new subscription_repository_1.SubscriptionRepository();
class MenuItemService {
    getMenuItems(restaurantId, filters) {
        return __awaiter(this, void 0, void 0, function* () {
            return menuItemRepository.findMany(restaurantId, filters);
        });
    }
    getMenuItemById(id, restaurantId) {
        return __awaiter(this, void 0, void 0, function* () {
            return menuItemRepository.findById(id, restaurantId);
        });
    }
    createMenuItem(restaurantId, data) {
        return __awaiter(this, void 0, void 0, function* () {
            // 1. Enforce subscription plan limits
            const activeSub = yield subscriptionRepository.findActiveSubscriptionByRestaurantId(restaurantId);
            if (!activeSub) {
                throw new Error('No active subscription plan found. Please select a plan to add menu items.');
            }
            const maxItems = activeSub.plan.maxMenuItems;
            const currentCount = yield menuItemRepository.count(restaurantId);
            if (currentCount >= maxItems) {
                throw new Error(`Menu item limit reached. Your plan allows up to ${maxItems} items. Please upgrade.`);
            }
            // 2. Enforce category ownership/isolation
            const category = yield categoryRepository.findById(data.categoryId, restaurantId);
            if (!category) {
                throw new Error('Category not found or unauthorized');
            }
            // 3. Create menu item
            return menuItemRepository.create(Object.assign({ restaurantId }, data));
        });
    }
    updateMenuItem(id, restaurantId, data) {
        return __awaiter(this, void 0, void 0, function* () {
            // 1. Verify existence and ownership of menu item
            const item = yield menuItemRepository.findById(id, restaurantId);
            if (!item) {
                throw new Error('Menu item not found or unauthorized');
            }
            // 2. Verify category ownership if changing category
            if (data.categoryId && data.categoryId !== item.categoryId) {
                const category = yield categoryRepository.findById(data.categoryId, restaurantId);
                if (!category) {
                    throw new Error('Category not found or unauthorized');
                }
            }
            // 3. Perform update
            return menuItemRepository.update(id, restaurantId, data);
        });
    }
    deleteMenuItem(id, restaurantId) {
        return __awaiter(this, void 0, void 0, function* () {
            // 1. Verify existence and ownership
            const item = yield menuItemRepository.findById(id, restaurantId);
            if (!item) {
                throw new Error('Menu item not found or unauthorized');
            }
            // 2. Perform delete
            return menuItemRepository.delete(id, restaurantId);
        });
    }
}
exports.MenuItemService = MenuItemService;
//# sourceMappingURL=menuItem.service.js.map