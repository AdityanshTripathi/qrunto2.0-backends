"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const coupon_controller_1 = require("../../controllers/crm/coupon.controller");
const auth_middleware_1 = require("../../middlewares/auth.middleware");
const client_1 = require("@prisma/client");
const router = (0, express_1.Router)();
const couponController = new coupon_controller_1.CouponController();
router.use(auth_middleware_1.authenticate);
router.use((0, auth_middleware_1.requireRoles)([client_1.UserRole.RESTAURANT_OWNER, client_1.UserRole.SUPER_ADMIN]));
router.get('/', (req, res) => couponController.getCoupons(req, res));
router.post('/', (req, res) => couponController.createCoupon(req, res));
router.delete('/:id', (req, res) => couponController.deleteCoupon(req, res));
router.post('/issue', (req, res) => couponController.issueCoupon(req, res));
router.get('/customer/:customerId', (req, res) => couponController.getCustomerCoupons(req, res));
exports.default = router;
//# sourceMappingURL=coupon.routes.js.map