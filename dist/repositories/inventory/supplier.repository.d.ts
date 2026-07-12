import { Supplier } from '@prisma/client';
export declare class SupplierRepository {
    findMany(restaurantId: string): Promise<Supplier[]>;
    findActive(restaurantId: string): Promise<Supplier[]>;
    findById(id: string, restaurantId: string): Promise<Supplier | null>;
    create(restaurantId: string, data: {
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
    update(id: string, restaurantId: string, data: Partial<Omit<Supplier, 'id' | 'restaurantId' | 'createdAt' | 'updatedAt'>>): Promise<Supplier>;
    softDelete(id: string, restaurantId: string): Promise<Supplier>;
}
//# sourceMappingURL=supplier.repository.d.ts.map