import { StockTransfer } from '@prisma/client';
export declare class TransferService {
    getTransfers(restaurantId: string): Promise<StockTransfer[]>;
    createTransfer(sourceBranchId: string, userId: string, data: {
        destBranchId: string;
        notes?: string;
        items: Array<{
            rawMaterialId: string;
            quantity: number;
        }>;
    }): Promise<StockTransfer>;
    approveTransfer(id: string, destBranchId: string, userId: string): Promise<StockTransfer>;
    rejectTransfer(id: string, destBranchId: string, userId: string): Promise<StockTransfer>;
}
//# sourceMappingURL=transfer.service.d.ts.map