import { RestaurantTable } from '@prisma/client';
export declare class TableRepository {
    findMany(restaurantId: string): Promise<RestaurantTable[]>;
    findById(id: string, restaurantId: string): Promise<RestaurantTable | null>;
    findByTableNumber(tableNumber: string, restaurantId: string): Promise<RestaurantTable | null>;
    count(restaurantId: string): Promise<number>;
    create(data: {
        restaurantId: string;
        tableNumber: string;
        qrCodeUrl?: string;
    }): Promise<RestaurantTable>;
    update(id: string, restaurantId: string, data: Partial<Omit<RestaurantTable, 'id' | 'restaurantId' | 'createdAt' | 'updatedAt'>>): Promise<RestaurantTable>;
    softDelete(id: string, restaurantId: string): Promise<RestaurantTable>;
}
//# sourceMappingURL=table.repository.d.ts.map