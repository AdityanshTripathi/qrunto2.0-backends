import { OrderWithDetails } from '../repositories/order.repository';
import { OrderStatus } from '@prisma/client';
export declare class OrderService {
    getOrders(restaurantId: string, filters?: {
        status?: OrderStatus;
        date?: Date;
    }): Promise<OrderWithDetails[]>;
    getOrderById(id: string, restaurantId: string): Promise<OrderWithDetails | null>;
    getOrderStats(restaurantId: string): Promise<Record<string, number>>;
    updateOrderStatus(id: string, restaurantId: string, newStatus: OrderStatus): Promise<OrderWithDetails>;
}
//# sourceMappingURL=order.service.d.ts.map