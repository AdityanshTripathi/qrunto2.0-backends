import { Response } from 'express';
import { AuthenticatedRequest } from '../../middlewares/auth.middleware';
export declare class CouponController {
    getCoupons(req: AuthenticatedRequest, res: Response): Promise<void>;
    createCoupon(req: AuthenticatedRequest, res: Response): Promise<void>;
    deleteCoupon(req: AuthenticatedRequest, res: Response): Promise<void>;
    issueCoupon(req: AuthenticatedRequest, res: Response): Promise<void>;
    getCustomerCoupons(req: AuthenticatedRequest, res: Response): Promise<void>;
}
//# sourceMappingURL=coupon.controller.d.ts.map