import { RawMaterialRepository, RawMaterialFilters } from '../../repositories/inventory/raw-material.repository';
import { SupplierRepository } from '../../repositories/inventory/supplier.repository';
import { RawMaterial, LedgerActionType } from '@prisma/client';

const rawMaterialRepository = new RawMaterialRepository();
const supplierRepository = new SupplierRepository();

export class RawMaterialService {
  async getRawMaterials(restaurantId: string, filters?: RawMaterialFilters): Promise<RawMaterial[]> {
    return rawMaterialRepository.findMany(restaurantId, filters);
  }

  async getRawMaterialById(id: string, restaurantId: string): Promise<RawMaterial | null> {
    return rawMaterialRepository.findById(id, restaurantId);
  }

  async createRawMaterial(
    restaurantId: string,
    data: {
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
    }
  ): Promise<RawMaterial> {
    if (data.supplierId) {
      const supplier = await supplierRepository.findById(data.supplierId, restaurantId);
      if (!supplier) {
        throw new Error('Supplier not found or unauthorized');
      }
    }
    return rawMaterialRepository.create(restaurantId, data);
  }

  async updateRawMaterial(
    id: string,
    restaurantId: string,
    data: Partial<Omit<RawMaterial, 'id' | 'restaurantId' | 'createdAt' | 'updatedAt'>>
  ): Promise<RawMaterial> {
    if (data.supplierId) {
      const supplier = await supplierRepository.findById(data.supplierId, restaurantId);
      if (!supplier) {
        throw new Error('Supplier not found or unauthorized');
      }
    }
    return rawMaterialRepository.update(id, restaurantId, data);
  }

  async adjustStock(
    id: string,
    restaurantId: string,
    quantityChange: number,
    userId: string,
    actionType: LedgerActionType,
    reason?: string
  ): Promise<RawMaterial> {
    return rawMaterialRepository.adjustStock(id, restaurantId, quantityChange, userId, actionType, reason);
  }

  async deleteRawMaterial(id: string, restaurantId: string): Promise<RawMaterial> {
    return rawMaterialRepository.softDelete(id, restaurantId);
  }
}
