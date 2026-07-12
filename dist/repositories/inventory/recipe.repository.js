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
exports.RecipeRepository = void 0;
const prisma_1 = require("../../lib/prisma");
class RecipeRepository {
    findMany(restaurantId) {
        return __awaiter(this, void 0, void 0, function* () {
            return prisma_1.prisma.recipe.findMany({
                where: {
                    menuItem: {
                        restaurantId,
                    },
                },
                include: {
                    menuItem: {
                        select: {
                            id: true,
                            name: true,
                            price: true,
                        },
                    },
                    ingredients: {
                        include: {
                            rawMaterial: {
                                select: {
                                    id: true,
                                    name: true,
                                    unit: true,
                                    averageCost: true,
                                },
                            },
                        },
                    },
                },
                orderBy: {
                    menuItem: {
                        name: 'asc',
                    },
                },
            });
        });
    }
    findByMenuItemId(menuItemId, restaurantId) {
        return __awaiter(this, void 0, void 0, function* () {
            return prisma_1.prisma.recipe.findFirst({
                where: {
                    menuItemId,
                    menuItem: {
                        restaurantId,
                    },
                },
                include: {
                    menuItem: {
                        select: {
                            id: true,
                            name: true,
                            price: true,
                        },
                    },
                    ingredients: {
                        include: {
                            rawMaterial: {
                                select: {
                                    id: true,
                                    name: true,
                                    unit: true,
                                    averageCost: true,
                                },
                            },
                        },
                    },
                },
            });
        });
    }
    findById(id, restaurantId) {
        return __awaiter(this, void 0, void 0, function* () {
            return prisma_1.prisma.recipe.findFirst({
                where: {
                    id,
                    menuItem: {
                        restaurantId,
                    },
                },
                include: {
                    menuItem: {
                        select: {
                            id: true,
                            name: true,
                            price: true,
                        },
                    },
                    ingredients: {
                        include: {
                            rawMaterial: {
                                select: {
                                    id: true,
                                    name: true,
                                    unit: true,
                                    averageCost: true,
                                },
                            },
                        },
                    },
                },
            });
        });
    }
    create(restaurantId, data) {
        return __awaiter(this, void 0, void 0, function* () {
            return prisma_1.prisma.$transaction((tx) => __awaiter(this, void 0, void 0, function* () {
                // 1. Verify MenuItem belongs to the restaurant
                const menuItem = yield tx.menuItem.findFirst({
                    where: { id: data.menuItemId, restaurantId },
                });
                if (!menuItem) {
                    throw new Error('Menu item not found or unauthorized');
                }
                // 2. Verify all Raw Materials belong to the restaurant
                const rawMaterialIds = data.ingredients.map(i => i.rawMaterialId);
                const rawMaterialsCount = yield tx.rawMaterial.count({
                    where: {
                        id: { in: rawMaterialIds },
                        restaurantId,
                    },
                });
                if (rawMaterialsCount !== rawMaterialIds.length) {
                    throw new Error('One or more raw materials not found or unauthorized');
                }
                // 3. Create Recipe and ingredients
                const recipe = yield tx.recipe.create({
                    data: {
                        menuItemId: data.menuItemId,
                        notes: data.notes || null,
                        ingredients: {
                            create: data.ingredients.map(ing => ({
                                rawMaterialId: ing.rawMaterialId,
                                quantity: ing.quantity,
                            })),
                        },
                    },
                    include: {
                        ingredients: true,
                    },
                });
                return recipe;
            }));
        });
    }
    update(id, restaurantId, data) {
        return __awaiter(this, void 0, void 0, function* () {
            return prisma_1.prisma.$transaction((tx) => __awaiter(this, void 0, void 0, function* () {
                // 1. Verify Recipe belongs to this restaurant
                const existing = yield tx.recipe.findFirst({
                    where: {
                        id,
                        menuItem: {
                            restaurantId,
                        },
                    },
                });
                if (!existing) {
                    throw new Error('Recipe not found or unauthorized');
                }
                // 2. Update notes if provided
                if (data.notes !== undefined) {
                    yield tx.recipe.update({
                        where: { id },
                        data: { notes: data.notes || null },
                    });
                }
                // 3. Update ingredients if provided
                if (data.ingredients) {
                    // Verify all raw materials belong to the restaurant
                    const rawMaterialIds = data.ingredients.map(i => i.rawMaterialId);
                    const rawMaterialsCount = yield tx.rawMaterial.count({
                        where: {
                            id: { in: rawMaterialIds },
                            restaurantId,
                        },
                    });
                    if (rawMaterialsCount !== rawMaterialIds.length) {
                        throw new Error('One or more raw materials not found or unauthorized');
                    }
                    // Delete existing ingredients
                    yield tx.recipeIngredient.deleteMany({
                        where: { recipeId: id },
                    });
                    // Insert new ingredients
                    yield tx.recipeIngredient.createMany({
                        data: data.ingredients.map(ing => ({
                            recipeId: id,
                            rawMaterialId: ing.rawMaterialId,
                            quantity: ing.quantity,
                        })),
                    });
                }
                const updated = yield tx.recipe.findFirst({
                    where: { id },
                    include: {
                        menuItem: true,
                        ingredients: {
                            include: {
                                rawMaterial: true,
                            },
                        },
                    },
                });
                if (!updated) {
                    throw new Error('Recipe not found after update');
                }
                return updated;
            }));
        });
    }
}
exports.RecipeRepository = RecipeRepository;
//# sourceMappingURL=recipe.repository.js.map