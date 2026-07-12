import { Response } from 'express';
import { AuthenticatedRequest } from '../../middlewares/auth.middleware';
export declare class LoyaltyController {
    getTiers(req: AuthenticatedRequest, res: Response): Promise<void>;
    upsertTier(req: AuthenticatedRequest, res: Response): Promise<void>;
    deleteTier(req: AuthenticatedRequest, res: Response): Promise<void>;
    getBalanceByPhone(req: AuthenticatedRequest, res: Response): Promise<void>;
}
//# sourceMappingURL=loyalty.controller.d.ts.map