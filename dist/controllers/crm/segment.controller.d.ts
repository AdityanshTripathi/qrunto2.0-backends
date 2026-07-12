import { Response } from 'express';
import { AuthenticatedRequest } from '../../middlewares/auth.middleware';
export declare class SegmentController {
    getSegments(req: AuthenticatedRequest, res: Response): Promise<void>;
    createSegment(req: AuthenticatedRequest, res: Response): Promise<void>;
    deleteSegment(req: AuthenticatedRequest, res: Response): Promise<void>;
    getSegmentMembers(req: AuthenticatedRequest, res: Response): Promise<void>;
    retraceSegment(req: AuthenticatedRequest, res: Response): Promise<void>;
    getRFMScores(req: AuthenticatedRequest, res: Response): Promise<void>;
}
//# sourceMappingURL=segment.controller.d.ts.map