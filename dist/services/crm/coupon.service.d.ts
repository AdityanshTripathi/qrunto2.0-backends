import { CouponDiscountType } from '@prisma/client';
export interface CreateCouponInput {
    code: string;
    discountType: CouponDiscountType;
    discountValue: number;
    minOrderAmount: number;
    maxDiscountAmount: number | null;
    startDate: Date;
    endDate: Date;
}
export declare class CouponService {
    createCoupon(brandId: string, data: CreateCouponInput): Promise<any>;
    getCoupons(brandId: string): Promise<any[]>;
    deleteCoupon(brandId: string, couponId: string): Promise<void>;
    issueCouponToCustomer(customerId: string, couponId: string): Promise<any>;
    getCustomerAvailableCoupons(customerId: string, brandId: string): Promise<any[]>;
    validateAndRedeem(customerId: string, couponCode: string, orderAmount: number, orderId: string, tx?: any): Promise<{
        discountAmount: number;
    }>;
}
//# sourceMappingURL=coupon.service.d.ts.map