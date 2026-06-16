"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const plan_controller_1 = require("../controllers/plan.controller");
const router = (0, express_1.Router)();
const planController = new plan_controller_1.PlanController();
// Public route to list pricing plans
router.get('/', (req, res) => planController.getActivePlans(req, res));
exports.default = router;
//# sourceMappingURL=plan.routes.js.map