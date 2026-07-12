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
exports.RFMService = void 0;
const prisma_1 = require("../../lib/prisma");
class RFMService {
    // Calculate relative RFM scores and segments for a brand
    calculateRFM(brandId) {
        return __awaiter(this, void 0, void 0, function* () {
            const customers = yield prisma_1.prisma.customer.findMany({
                where: { brandId },
                include: {
                    profiles: true,
                },
            });
            if (customers.length === 0)
                return [];
            const now = new Date();
            // Map customers to their raw R, F, M values
            const rawData = customers.map((c) => {
                var _a, _b, _c;
                const profile = (_a = c.profiles) === null || _a === void 0 ? void 0 : _a[0];
                const lastVisit = (profile === null || profile === void 0 ? void 0 : profile.lastVisit) ? new Date(profile.lastVisit) : c.createdAt;
                const recencyDays = Math.max(0, Math.floor((now.getTime() - lastVisit.getTime()) / (1000 * 60 * 60 * 24)));
                const frequency = (_b = profile === null || profile === void 0 ? void 0 : profile.totalOrders) !== null && _b !== void 0 ? _b : 0;
                const monetary = (_c = profile === null || profile === void 0 ? void 0 : profile.totalSpend) !== null && _c !== void 0 ? _c : 0;
                return {
                    customerId: c.id,
                    name: c.name,
                    phone: c.phone,
                    recencyDays,
                    frequency,
                    monetary,
                    rScore: 1,
                    fScore: 1,
                    mScore: 1,
                };
            });
            const total = rawData.length;
            // Helper to assign 1-5 score based on sorted array percentiles (quintiles)
            // For Recency: LOWER days is BETTER, so lower index gets HIGHER score when sorting ascending
            rawData.sort((a, b) => a.recencyDays - b.recencyDays); // lowest days first
            rawData.forEach((item, index) => {
                const percentile = index / total;
                if (percentile < 0.2)
                    item.rScore = 5;
                else if (percentile < 0.4)
                    item.rScore = 4;
                else if (percentile < 0.6)
                    item.rScore = 3;
                else if (percentile < 0.8)
                    item.rScore = 2;
                else
                    item.rScore = 1;
            });
            // For Frequency: HIGHER is BETTER, so higher index gets HIGHER score when sorting ascending
            rawData.sort((a, b) => a.frequency - b.frequency);
            rawData.forEach((item, index) => {
                const percentile = index / total;
                if (percentile < 0.2)
                    item.fScore = 1;
                else if (percentile < 0.4)
                    item.fScore = 2;
                else if (percentile < 0.6)
                    item.fScore = 3;
                else if (percentile < 0.8)
                    item.fScore = 4;
                else
                    item.fScore = 5;
            });
            // For Monetary: HIGHER is BETTER, so higher index gets HIGHER score when sorting ascending
            rawData.sort((a, b) => a.monetary - b.monetary);
            rawData.forEach((item, index) => {
                const percentile = index / total;
                if (percentile < 0.2)
                    item.mScore = 1;
                else if (percentile < 0.4)
                    item.mScore = 2;
                else if (percentile < 0.6)
                    item.mScore = 3;
                else if (percentile < 0.8)
                    item.mScore = 4;
                else
                    item.mScore = 5;
            });
            // Segment mappings based on R & F scores
            const results = rawData.map((item) => {
                let segment = 'Need Attention';
                const { rScore, fScore, mScore } = item;
                if (rScore >= 4 && fScore >= 4) {
                    segment = 'Champions';
                }
                else if (rScore >= 3 && fScore >= 3) {
                    segment = 'Loyal Customers';
                }
                else if (rScore >= 4 && fScore === 1) {
                    segment = 'Recent / New';
                }
                else if (rScore >= 3 && fScore <= 2) {
                    segment = 'Promising';
                }
                else if (rScore === 2 && fScore >= 3) {
                    segment = 'At Risk / Churn Alert';
                }
                else if (rScore === 1 && fScore >= 4) {
                    segment = 'Can\'t Lose Them';
                }
                else if (rScore <= 2 && fScore <= 2) {
                    segment = 'Lost / Cold';
                }
                return Object.assign(Object.assign({}, item), { segment });
            });
            // Update customer metadata with scores inside database
            for (const res of results) {
                const customer = customers.find((c) => c.id === res.customerId);
                const existingMeta = ((customer === null || customer === void 0 ? void 0 : customer.metadataJson) || {});
                yield prisma_1.prisma.customer.update({
                    where: { id: res.customerId },
                    data: {
                        metadataJson: Object.assign(Object.assign({}, existingMeta), { rfm: {
                                rScore: res.rScore,
                                fScore: res.fScore,
                                mScore: res.mScore,
                                segment: res.segment,
                            } }),
                    },
                });
            }
            return results;
        });
    }
}
exports.RFMService = RFMService;
//# sourceMappingURL=rfm.service.js.map