import { RestaurantTable } from '@prisma/client';
export declare class TableService {
    getTables(restaurantId: string): Promise<RestaurantTable[]>;
    getTableById(id: string, restaurantId: string): Promise<RestaurantTable | null>;
    createTable(restaurantId: string, tableNumber: string): Promise<RestaurantTable>;
    updateTable(id: string, restaurantId: string, data: {
        tableNumber?: string;
        isActive?: boolean;
    }): Promise<RestaurantTable>;
    deleteTable(id: string, restaurantId: string): Promise<RestaurantTable>;
}
//# sourceMappingURL=table.service.d.ts.map