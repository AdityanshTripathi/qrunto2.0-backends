import { Request, Response } from 'express';
import { AuthenticatedRequest } from '../../middlewares/auth.middleware';
export declare class FeedbackController {
    submitFeedback(req: Request, res: Response): Promise<void>;
    getTickets(req: AuthenticatedRequest, res: Response): Promise<void>;
    updateTicket(req: AuthenticatedRequest, res: Response): Promise<void>;
    getFeedbackStats(req: AuthenticatedRequest, res: Response): Promise<void>;
}
//# sourceMappingURL=feedback.controller.d.ts.map