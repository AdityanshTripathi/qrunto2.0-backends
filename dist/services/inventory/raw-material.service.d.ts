import { RawMaterialFilters } from '../../repositories/inventory/raw-material.repository';
import { RawMaterial, LedgerActionType } from '@prisma/client';
export declare class RawMaterialService {
    getRawMaterials(restaurantId: string, filters?: RawMaterialFilters): Promise<RawMaterial[]>;
    getRawMaterialById(id: string, restaurantId: string): Promise<RawMaterial | null>;
    createRawMaterial(restaurantId: string, data: {
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
    }): Promise<RawMaterial>;
    updateRawMaterial(id: string, restaurantId: string, data: Partial<Omit<RawMaterial, 'id' | 'restaurantId' | 'createdAt' | 'updatedAt'>>): Promise<RawMaterial>;
    adjustStock(id: string, restaurantId: string, quantityChange: number, userId: string, actionType: LedgerActionType, reason?: string): Promise<RawMaterial>;
    deleteRawMaterial(id: string, restaurantId: string): Promise<RawMaterial>;
}
//# sourceMappingURL=raw-material.service.d.ts.map