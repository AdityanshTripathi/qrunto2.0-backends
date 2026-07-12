import { PurchaseOrder, PurchaseOrderStatus } from '@prisma/client';
export declare class PurchaseRepository {
    findMany(restaurantId: string): Promise<PurchaseOrder[]>;
    findById(id: string, restaurantId: string): Promise<any | null>;
    create(restaurantId: string, data: {
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
    update(id: string, restaurantId: string, data: {
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
    receive(id: string, restaurantId: string, data: {
        receivedDate: Date;
        invoiceNumber?: string;
        invoiceAttachmentUrl?: string;
        notes?: string;
    }): Promise<PurchaseOrder>;
}
//# sourceMappingURL=purchase.repository.d.ts.map