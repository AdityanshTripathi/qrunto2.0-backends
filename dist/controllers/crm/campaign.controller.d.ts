import { Response } from 'express';
import { AuthenticatedRequest } from '../../middlewares/auth.middleware';
export declare class CampaignController {
    getCampaigns(req: AuthenticatedRequest, res: Response): Promise<void>;
    createCampaign(req: AuthenticatedRequest, res: Response): Promise<void>;
    deleteCampaign(req: AuthenticatedRequest, res: Response): Promise<void>;
    getCampaignLogs(req: AuthenticatedRequest, res: Response): Promise<void>;
    getCampaignStats(req: AuthenticatedRequest, res: Response): Promise<void>;
}
//# sourceMappingURL=campaign.controller.d.ts.map