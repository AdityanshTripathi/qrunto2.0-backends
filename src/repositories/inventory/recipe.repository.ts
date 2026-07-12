import { prisma } from '../../lib/prisma';
import { Recipe } from '@prisma/client';

export class RecipeRepository {
  async findMany(restaurantId: string): Promise<Recipe[]> {
    return prisma.recipe.findMany({
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
  }

  async findByMenuItemId(menuItemId: string, restaurantId: string): Promise<Recipe | null> {
    return prisma.recipe.findFirst({
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
  }

  async findById(id: string, restaurantId: string): Promise<Recipe | null> {
    return prisma.recipe.findFirst({
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
  }

  async create(
    restaurantId: string,
    data: {
      menuItemId: string;
      notes?: string;
      ingredients: Array<{
        rawMaterialId: string;
        quantity: number;
      }>;
    }
  ): Promise<Recipe> {
    return prisma.$transaction(async (tx) => {
      // 1. Verify MenuItem belongs to the restaurant
      const menuItem = await tx.menuItem.findFirst({
        where: { id: data.menuItemId, restaurantId },
      });

      if (!menuItem) {
        throw new Error('Menu item not found or unauthorized');
      }

      // 2. Verify all Raw Materials belong to the restaurant
      const rawMaterialIds = data.ingredients.map(i => i.rawMaterialId);
      const rawMaterialsCount = await tx.rawMaterial.count({
        where: {
          id: { in: rawMaterialIds },
          restaurantId,
        },
      });

      if (rawMaterialsCount !== rawMaterialIds.length) {
        throw new Error('One or more raw materials not found or unauthorized');
      }

      // 3. Create Recipe and ingredients
      const recipe = await tx.recipe.create({
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
    });
  }

  async update(
    id: string,
    restaurantId: string,
    data: {
      notes?: string;
      ingredients?: Array<{
        rawMaterialId: string;
        quantity: number;
      }>;
    }
  ): Promise<Recipe> {
    return prisma.$transaction(async (tx) => {
      // 1. Verify Recipe belongs to this restaurant
      const existing = await tx.recipe.findFirst({
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
        await tx.recipe.update({
          where: { id },
          data: { notes: data.notes || null },
        });
      }

      // 3. Update ingredients if provided
      if (data.ingredients) {
        // Verify all raw materials belong to the restaurant
        const rawMaterialIds = data.ingredients.map(i => i.rawMaterialId);
        const rawMaterialsCount = await tx.rawMaterial.count({
          where: {
            id: { in: rawMaterialIds },
            restaurantId,
          },
        });

        if (rawMaterialsCount !== rawMaterialIds.length) {
          throw new Error('One or more raw materials not found or unauthorized');
        }

        // Delete existing ingredients
        await tx.recipeIngredient.deleteMany({
          where: { recipeId: id },
        });

        // Insert new ingredients
        await tx.recipeIngredient.createMany({
          data: data.ingredients.map(ing => ({
            recipeId: id,
            rawMaterialId: ing.rawMaterialId,
            quantity: ing.quantity,
          })),
        });
      }

      const updated = await tx.recipe.findFirst({
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
    });
  }
}
