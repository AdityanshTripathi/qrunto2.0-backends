"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const analytics_controller_1 = require("../controllers/analytics.controller");
const auth_middleware_1 = require("../middlewares/auth.middleware");
const router = (0, express_1.Router)();
const analyticsController = new analytics_controller_1.AnalyticsController();
// All routes require owner authentication
router.use(auth_middleware_1.authenticate);
router.get('/overview', (req, res) => analyticsController.getOverview(req, res));
exports.default = router;
//# sourceMappingURL=analytics.routes.js.map