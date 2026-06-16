"use strict";
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.PlanController = void 0;
const plan_service_1 = require("../services/plan.service");
const planService = new plan_service_1.PlanService();
class PlanController {
    getActivePlans(req, res) {
        return __awaiter(this, void 0, void 0, function* () {
            try {
                const plans = yield planService.getActivePlans();
                res.status(200).json({ plans });
            }
            catch (err) {
                res.status(500).json({ error: err.message });
            }
        });
    }
}
exports.PlanController = PlanController;
//# sourceMappingURL=plan.controller.js.map