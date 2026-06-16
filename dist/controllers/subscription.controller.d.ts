import { Request, Response } from 'express';
export declare class SubscriptionController {
    createPendingSubscription(req: Request, res: Response): Promise<void>;
    getActiveSubscription(req: Request, res: Response): Promise<void>;
    redeemLicenseCode(req: Request, res: Response): Promise<void>;
    purchaseSubscription(req: Request, res: Response): Promise<void>;
}
//# sourceMappingURL=subscription.controller.d.ts.map