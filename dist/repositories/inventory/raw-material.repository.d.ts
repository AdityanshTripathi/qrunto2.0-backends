import { RawMaterial, RawMaterialStatus, LedgerActionType } from '@prisma/client';
export interface RawMaterialFilters {
    category?: string;
    status?: RawMaterialStatus;
    lowStock?: boolean;
}
export declare class RawMaterialRepository {
    findMany(restaurantId: string, filters?: RawMaterialFilters): Promise<RawMaterial[]>;
    findById(id: string, restaurantId: string): Promise<RawMaterial | null>;
    create(restaurantId: string, data: {
        supplierId?: string;
        name: string;
        category: string;
        sku: string;
        unit: string;
        openingStock: number;
        currentStock: number;
        minimumStockLevel: number;
        maximumStockLevel: number;
        reorderQuantity: number;
        purchasePrice: number;
        averageCost: number;
        expiryDate?: Date;
        storageLocation?: string;
        notes?: string;
        status?: RawMaterialStatus;
    }): Promise<RawMaterial>;
    update(id: string, restaurantId: string, data: Partial<Omit<RawMaterial, 'id' | 'restaurantId' | 'createdAt' | 'updatedAt'>>): Promise<RawMaterial>;
    adjustStock(id: string, restaurantId: string, quantityChange: number, userId: string, actionType: LedgerActionType, reason?: string): Promise<RawMaterial>;
    softDelete(id: string, restaurantId: string): Promise<RawMaterial>;
}
//# sourceMappingURL=raw-material.repository.d.ts.map