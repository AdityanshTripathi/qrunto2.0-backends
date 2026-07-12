import { Supplier } from '@prisma/client';
export declare class SupplierService {
    getSuppliers(restaurantId: string): Promise<Supplier[]>;
    getActiveSuppliers(restaurantId: string): Promise<Supplier[]>;
    getSupplierById(id: string, restaurantId: string): Promise<Supplier | null>;
    createSupplier(restaurantId: string, data: {
        name: string;
        contactName?: string;
        phone: string;
        email?: string;
        gstNumber?: string;
        address?: string;
        creditDays?: number;
        outstandingBalance?: number;
        isActive?: boolean;
    }): Promise<Supplier>;
    updateSupplier(id: string, restaurantId: string, data: Partial<Omit<Supplier, 'id' | 'restaurantId' | 'createdAt' | 'updatedAt'>>): Promise<Supplier>;
    deleteSupplier(id: string, restaurantId: string): Promise<Supplier>;
}
//# sourceMappingURL=supplier.service.d.ts.map