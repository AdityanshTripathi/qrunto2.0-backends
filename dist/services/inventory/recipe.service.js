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
exports.RecipeService = void 0;
const recipe_repository_1 = require("../../repositories/inventory/recipe.repository");
const recipeRepository = new recipe_repository_1.RecipeRepository();
function getConversionFactor(materialUnit) {
    const unit = (materialUnit || '').toUpperCase().trim();
    if (unit === 'KG' || unit === 'LTR' || unit === 'L') {
        return 1000;
    }
    return 1;
}
class RecipeService {
    calculateMetrics(recipe) {
        var _a, _b, _c;
        const menuItemPrice = ((_a = recipe.menuItem) === null || _a === void 0 ? void 0 : _a.price) || 0;
        // Food Cost = sum((RecipeIngredient.quantity / conversionFactor) * RawMaterial.averageCost)
        let foodCost = 0;
        if (recipe.ingredients) {
            for (const ing of recipe.ingredients) {
                const avgCost = ((_b = ing.rawMaterial) === null || _b === void 0 ? void 0 : _b.averageCost) || 0;
                const conversionFactor = getConversionFactor((_c = ing.rawMaterial) === null || _c === void 0 ? void 0 : _c.unit);
                const scaledQuantity = ing.quantity / conversionFactor;
                foodCost += scaledQuantity * avgCost;
            }
        }
        // Food Cost % = (Food Cost / MenuItem.price) * 100
        const foodCostPercentage = menuItemPrice > 0 ? (foodCost / menuItemPrice) * 100 : 0;
        // Gross Profit = MenuItem.price - Food Cost
        const grossProfit = menuItemPrice - foodCost;
        // Margin % = (Gross Profit / MenuItem.price) * 100
        const marginPercentage = menuItemPrice > 0 ? (grossProfit / menuItemPrice) * 100 : 0;
        return {
            foodCost,
            foodCostPercentage,
            grossProfit,
            marginPercentage,
        };
    }
    getRecipes(restaurantId) {
        return __awaiter(this, void 0, void 0, function* () {
            const recipes = yield recipeRepository.findMany(restaurantId);
            return recipes.map(recipe => (Object.assign(Object.assign({}, recipe), { metrics: this.calculateMetrics(recipe) })));
        });
    }
    getRecipeByMenuItemId(menuItemId, restaurantId) {
        return __awaiter(this, void 0, void 0, function* () {
            const recipe = yield recipeRepository.findByMenuItemId(menuItemId, restaurantId);
            if (!recipe)
                return null;
            return Object.assign(Object.assign({}, recipe), { metrics: this.calculateMetrics(recipe) });
        });
    }
    getRecipeById(id, restaurantId) {
        return __awaiter(this, void 0, void 0, function* () {
            const recipe = yield recipeRepository.findById(id, restaurantId);
            if (!recipe)
                return null;
            return Object.assign(Object.assign({}, recipe), { metrics: this.calculateMetrics(recipe) });
        });
    }
    createRecipe(restaurantId, data) {
        return __awaiter(this, void 0, void 0, function* () {
            return recipeRepository.create(restaurantId, data);
        });
    }
    updateRecipe(id, restaurantId, data) {
        return __awaiter(this, void 0, void 0, function* () {
            return recipeRepository.update(id, restaurantId, data);
        });
    }
}
exports.RecipeService = RecipeService;
//# sourceMappingURL=recipe.service.js.map