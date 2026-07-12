import { Request, Response } from 'express';
export declare class TransferController {
    getTransfers(req: Request, res: Response): Promise<void>;
    createTransfer(req: Request, res: Response): Promise<void>;
    approveTransfer(req: Request, res: Response): Promise<void>;
    rejectTransfer(req: Request, res: Response): Promise<void>;
}
//# sourceMappingURL=transfer.controller.d.ts.map