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
exports.RecipeController = void 0;
const zod_1 = require("zod");
const recipe_service_1 = require("../../services/inventory/recipe.service");
const recipeService = new recipe_service_1.RecipeService();
const CreateRecipeIngredientSchema = zod_1.z.object({
    rawMaterialId: zod_1.z.string().uuid('Invalid raw material ID'),
    quantity: zod_1.z.number().positive('Quantity must be greater than 0'),
});
const CreateRecipeSchema = zod_1.z.object({
    menuItemId: zod_1.z.string().uuid('Invalid menu item ID'),
    notes: zod_1.z.string().max(1000).optional().nullable(),
    ingredients: zod_1.z.array(CreateRecipeIngredientSchema).min(1, 'At least one ingredient is required'),
});
const UpdateRecipeSchema = zod_1.z.object({
    notes: zod_1.z.string().max(1000).optional().nullable(),
    ingredients: zod_1.z.array(CreateRecipeIngredientSchema).optional(),
});
class RecipeController {
    getRecipes(req, res) {
        return __awaiter(this, void 0, void 0, function* () {
            try {
                if (!req.user) {
                    res.status(401).json({ error: 'Authentication required' });
                    return;
                }
                const restaurantId = req.user.restaurantId;
                if (!restaurantId) {
                    res.status(400).json({ error: 'No restaurant associated with this session' });
                    return;
                }
                const recipes = yield recipeService.getRecipes(restaurantId);
                res.status(200).json({ recipes });
            }
            catch (err) {
                res.status(500).json({ error: err.message });
            }
        });
    }
    getRecipeByMenuItemId(req, res) {
        return __awaiter(this, void 0, void 0, function* () {
            try {
                if (!req.user) {
                    res.status(401).json({ error: 'Authentication required' });
                    return;
                }
                const restaurantId = req.user.restaurantId;
                if (!restaurantId) {
                    res.status(400).json({ error: 'No restaurant associated with this session' });
                    return;
                }
                const menuItemId = req.params['menuItemId'];
                const recipe = yield recipeService.getRecipeByMenuItemId(menuItemId, restaurantId);
                if (!recipe) {
                    res.status(404).json({ error: 'Recipe not found for this menu item' });
                    return;
                }
                res.status(200).json({ recipe });
            }
            catch (err) {
                res.status(500).json({ error: err.message });
            }
        });
    }
    createRecipe(req, res) {
        return __awaiter(this, void 0, void 0, function* () {
            try {
                if (!req.user) {
                    res.status(401).json({ error: 'Authentication required' });
                    return;
                }
                const restaurantId = req.user.restaurantId;
                if (!restaurantId) {
                    res.status(400).json({ error: 'No restaurant associated with this session' });
                    return;
                }
                const validationResult = CreateRecipeSchema.safeParse(req.body);
                if (!validationResult.success) {
                    res.status(400).json({ errors: validationResult.error.flatten().fieldErrors });
                    return;
                }
                const data = validationResult.data;
                const payload = {
                    menuItemId: data.menuItemId,
                    ingredients: data.ingredients,
                };
                if (data.notes !== undefined && data.notes !== null) {
                    payload.notes = data.notes;
                }
                const recipe = yield recipeService.createRecipe(restaurantId, payload);
                res.status(201).json({ recipe });
            }
            catch (err) {
                res.status(400).json({ error: err.message });
            }
        });
    }
    updateRecipe(req, res) {
        return __awaiter(this, void 0, void 0, function* () {
            try {
                if (!req.user) {
                    res.status(401).json({ error: 'Authentication required' });
                    return;
                }
                const restaurantId = req.user.restaurantId;
                if (!restaurantId) {
                    res.status(400).json({ error: 'No restaurant associated with this session' });
                    return;
                }
                const id = req.params['id'];
                const validationResult = UpdateRecipeSchema.safeParse(req.body);
                if (!validationResult.success) {
                    res.status(400).json({ errors: validationResult.error.flatten().fieldErrors });
                    return;
                }
                const data = validationResult.data;
                const payload = {};
                if (data.notes !== undefined && data.notes !== null)
                    payload.notes = data.notes;
                if (data.ingredients !== undefined)
                    payload.ingredients = data.ingredients;
                const recipe = yield recipeService.updateRecipe(id, restaurantId, payload);
                res.status(200).json({ recipe });
            }
            catch (err) {
                res.status(400).json({ error: err.message });
            }
        });
    }
}
exports.RecipeController = RecipeController;
//# sourceMappingURL=recipe.controller.js.map