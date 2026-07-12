import { Router } from 'express';
import { CouponController } from '../../controllers/crm/coupon.controller';
import { authenticate, requireRoles } from '../../middlewares/auth.middleware';
import { UserRole } from '@prisma/client';

const router = Router();
const couponController = new CouponController();

router.use(authenticate);
router.use(requireRoles([UserRole.RESTAURANT_OWNER, UserRole.SUPER_ADMIN]));

router.get('/', (req, res) => couponController.getCoupons(req, res));
router.post('/', (req, res) => couponController.createCoupon(req, res));
router.delete('/:id', (req, res) => couponController.deleteCoupon(req, res));
router.post('/issue', (req, res) => couponController.issueCoupon(req, res));
router.get('/customer/:customerId', (req, res) => couponController.getCustomerCoupons(req, res));

export default router;
