import { Response } from 'express';
import { AuthenticatedRequest } from '../../middlewares/auth.middleware';
export declare class AIGatewayController {
    searchCustomers(req: AuthenticatedRequest, res: Response): Promise<void>;
    updateCustomerSummary(req: AuthenticatedRequest, res: Response): Promise<void>;
    getSegmentsOverview(req: AuthenticatedRequest, res: Response): Promise<void>;
    getLoyaltyOverview(req: AuthenticatedRequest, res: Response): Promise<void>;
}
//# sourceMappingURL=ai-gateway.controller.d.ts.map