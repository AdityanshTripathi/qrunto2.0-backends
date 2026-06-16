import { Order, OrderStatus, OrderItem, RestaurantTable } from '@prisma/client';
export type OrderWithDetails = Order & {
    table: RestaurantTable;
    orderItems: OrderItem[];
};
export declare class OrderRepository {
    findMany(restaurantId: string, filters?: {
        status?: OrderStatus;
        date?: Date;
    }): Promise<OrderWithDetails[]>;
    findById(id: string, restaurantId: string): Promise<OrderWithDetails | null>;
    countByStatus(restaurantId: string): Promise<Record<string, number>>;
    updateStatus(id: string, restaurantId: string, status: OrderStatus): Promise<OrderWithDetails>;
}
//# sourceMappingURL=order.repository.d.ts.map