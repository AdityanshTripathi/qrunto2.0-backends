import { MenuItem } from '@prisma/client';
export declare class MenuItemService {
    getMenuItems(restaurantId: string, filters?: {
        categoryId?: string;
    }): Promise<MenuItem[]>;
    getMenuItemById(id: string, restaurantId: string): Promise<MenuItem | null>;
    createMenuItem(restaurantId: string, data: {
        categoryId: string;
        name: string;
        description?: string | null;
        price: number;
        imageUrl?: string | null;
        isAvailable?: boolean;
        isFeatured?: boolean;
    }): Promise<MenuItem>;
    updateMenuItem(id: string, restaurantId: string, data: {
        categoryId?: string;
        name?: string;
        description?: string | null;
        price?: number;
        imageUrl?: string | null;
        isAvailable?: boolean;
        isFeatured?: boolean;
    }): Promise<MenuItem>;
    deleteMenuItem(id: string, restaurantId: string): Promise<MenuItem>;
}
//# sourceMappingURL=menuItem.service.d.ts.map