import { StockAudit } from '@prisma/client';
export declare class AuditService {
    getAudits(restaurantId: string): Promise<StockAudit[]>;
    createAudit(restaurantId: string, userId: string, data: {
        notes?: string;
        items: Array<{
            rawMaterialId: string;
            actualStock: number;
            notes?: string;
        }>;
    }): Promise<StockAudit>;
}
//# sourceMappingURL=audit.service.d.ts.map