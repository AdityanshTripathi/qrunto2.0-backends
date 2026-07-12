import { PurchaseOrder, PurchaseOrderStatus } from '@prisma/client';
export declare class PurchaseService {
    getPurchaseOrders(restaurantId: string): Promise<PurchaseOrder[]>;
    getPurchaseOrderById(id: string, restaurantId: string): Promise<any>;
    createPurchaseOrder(restaurantId: string, data: {
        supplierId: string;
        poNumber: string;
        status?: PurchaseOrderStatus;
        orderDate?: Date;
        expectedDate?: Date;
        subtotal: number;
        gstAmount: number;
        grandTotal: number;
        notes?: string;
        items: Array<{
            rawMaterialId: string;
            quantity: number;
            unitPrice: number;
            gstPercentage?: number;
            totalCost: number;
            expiryDate?: Date;
        }>;
    }): Promise<PurchaseOrder>;
    updatePurchaseOrder(id: string, restaurantId: string, data: {
        supplierId?: string;
        poNumber?: string;
        status?: PurchaseOrderStatus;
        orderDate?: Date;
        expectedDate?: Date;
        subtotal?: number;
        gstAmount?: number;
        grandTotal?: number;
        invoiceNumber?: string;
        invoiceAttachmentUrl?: string;
        notes?: string;
        items?: Array<{
            rawMaterialId: string;
            quantity: number;
            unitPrice: number;
            gstPercentage?: number;
            totalCost: number;
            expiryDate?: Date;
        }>;
    }): Promise<PurchaseOrder>;
    receivePurchaseOrder(id: string, restaurantId: string, data: {
        receivedDate: Date;
        invoiceNumber?: string;
        invoiceAttachmentUrl?: string;
        notes?: string;
    }): Promise<PurchaseOrder>;
}
//# sourceMappingURL=purchase.service.d.ts.map