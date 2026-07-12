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
exports.ReportController = void 0;
const zod_1 = require("zod");
const report_service_1 = require("../../services/inventory/report.service");
const reportService = new report_service_1.ReportService();
const ConsumptionAnalyticsSchema = zod_1.z.object({
    startDate: zod_1.z.string().datetime().optional(),
    endDate: zod_1.z.string().datetime().optional(),
});
class ReportController {
    getDashboardMetrics(req, res) {
        return __awaiter(this, void 0, void 0, function* () {
            try {
                if (!req.user) {
                    res.status(401).json({ error: 'Authentication required' });
                    return;
                }
                const restaurantId = req.user.restaurantId;
                if (!restaurantId) {
                    res.status(400).json({ error: 'No restaurant associated with this session' });
                    return;
                }
                const metrics = yield reportService.getDashboardMetrics(restaurantId);
                res.status(200).json({ metrics });
            }
            catch (err) {
                res.status(500).json({ error: err.message });
            }
        });
    }
    getConsumptionAnalytics(req, res) {
        return __awaiter(this, void 0, void 0, function* () {
            try {
                if (!req.user) {
                    res.status(401).json({ error: 'Authentication required' });
                    return;
                }
                const restaurantId = req.user.restaurantId;
                if (!restaurantId) {
                    res.status(400).json({ error: 'No restaurant associated with this session' });
                    return;
                }
                const validationResult = ConsumptionAnalyticsSchema.safeParse(req.query);
                if (!validationResult.success) {
                    res.status(400).json({ errors: validationResult.error.flatten().fieldErrors });
                    return;
                }
                const endDate = validationResult.data.endDate
                    ? new Date(validationResult.data.endDate)
                    : new Date();
                const startDate = validationResult.data.startDate
                    ? new Date(validationResult.data.startDate)
                    : new Date(Date.now() - 7 * 24 * 60 * 60 * 1000); // 7 days ago
                const analytics = yield reportService.getConsumptionAnalytics(restaurantId, startDate, endDate);
                res.status(200).json({ analytics });
            }
            catch (err) {
                res.status(500).json({ error: err.message });
            }
        });
    }
}
exports.ReportController = ReportController;
//# sourceMappingURL=report.controller.js.map