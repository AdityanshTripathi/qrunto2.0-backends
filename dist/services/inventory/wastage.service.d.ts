import { WastageRecord, WastageReason } from '@prisma/client';
export declare class WastageService {
    getWastageRecords(restaurantId: string): Promise<WastageRecord[]>;
    createWastageRecord(restaurantId: string, userId: string, data: {
        rawMaterialId: string;
        quantity: number;
        reason: WastageReason;
        notes?: string;
        wasteDate?: Date;
    }): Promise<WastageRecord>;
}
//# sourceMappingURL=wastage.service.d.ts.map