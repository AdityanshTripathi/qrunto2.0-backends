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
    applyLoyaltyDiscount(id: string, restaurantId: string, pointsToRedeem: number): Promise<OrderWithDetails>;
    payOrder(id: string, restaurantId: string, paymentMethod: string): Promise<OrderWithDetails>;
}
//# sourceMappingURL=order.service.d.ts.map