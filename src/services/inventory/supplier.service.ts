import { SupplierRepository } from '../../repositories/inventory/supplier.repository';
import { Supplier } from '@prisma/client';

const supplierRepository = new SupplierRepository();

export class SupplierService {
  async getSuppliers(restaurantId: string): Promise<Supplier[]> {
    return supplierRepository.findMany(restaurantId);
  }

  async getActiveSuppliers(restaurantId: string): Promise<Supplier[]> {
    return supplierRepository.findActive(restaurantId);
  }

  async getSupplierById(id: string, restaurantId: string): Promise<Supplier | null> {
    return supplierRepository.findById(id, restaurantId);
  }

  async createSupplier(
    restaurantId: string,
    data: {
      name: string;
      contactName?: string;
      phone: string;
      email?: string;
      gstNumber?: string;
      address?: string;
      creditDays?: number;
      outstandingBalance?: number;
      isActive?: boolean;
    }
  ): Promise<Supplier> {
    return supplierRepository.create(restaurantId, data);
  }

  async updateSupplier(
    id: string,
    restaurantId: string,
    data: Partial<Omit<Supplier, 'id' | 'restaurantId' | 'createdAt' | 'updatedAt'>>
  ): Promise<Supplier> {
    return supplierRepository.update(id, restaurantId, data);
  }

  async deleteSupplier(id: string, restaurantId: string): Promise<Supplier> {
    return supplierRepository.softDelete(id, restaurantId);
  }
}
