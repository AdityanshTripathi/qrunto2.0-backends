import { PurchaseRepository } from '../../repositories/inventory/purchase.repository';
import { SupplierRepository } from '../../repositories/inventory/supplier.repository';
import { PurchaseOrder, PurchaseOrderStatus } from '@prisma/client';

const purchaseRepository = new PurchaseRepository();
const supplierRepository = new SupplierRepository();

export class PurchaseService {
  async getPurchaseOrders(restaurantId: string): Promise<PurchaseOrder[]> {
    return purchaseRepository.findMany(restaurantId);
  }

  async getPurchaseOrderById(id: string, restaurantId: string): Promise<any> {
    return purchaseRepository.findById(id, restaurantId);
  }

  async createPurchaseOrder(
    restaurantId: string,
    data: {
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
    }
  ): Promise<PurchaseOrder> {
    // Validate supplier
    const supplier = await supplierRepository.findById(data.supplierId, restaurantId);
    if (!supplier) {
      throw new Error('Supplier not found or unauthorized');
    }
    return purchaseRepository.create(restaurantId, data);
  }

  async updatePurchaseOrder(
    id: string,
    restaurantId: string,
    data: {
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
    }
  ): Promise<PurchaseOrder> {
    if (data.supplierId) {
      const supplier = await supplierRepository.findById(data.supplierId, restaurantId);
      if (!supplier) {
        throw new Error('Supplier not found or unauthorized');
      }
    }
    return purchaseRepository.update(id, restaurantId, data);
  }

  async receivePurchaseOrder(
    id: string,
    restaurantId: string,
    data: {
      receivedDate: Date;
      invoiceNumber?: string;
      invoiceAttachmentUrl?: string;
      notes?: string;
    }
  ): Promise<PurchaseOrder> {
    return purchaseRepository.receive(id, restaurantId, data);
  }
}
