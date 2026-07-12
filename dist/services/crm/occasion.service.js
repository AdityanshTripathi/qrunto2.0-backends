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
exports.OccasionService = void 0;
const prisma_1 = require("../../lib/prisma");
class OccasionService {
    // Scans all customers and dispatches occasion messages if month & day match today
    checkAndSendOccasionMessages() {
        return __awaiter(this, void 0, void 0, function* () {
            const customers = yield prisma_1.prisma.customer.findMany({
                include: { brand: true },
            });
            const now = new Date();
            const todayMonth = now.getMonth() + 1; // 1-12
            const todayDay = now.getDate(); // 1-31
            const dispatched = [];
            for (const customer of customers) {
                const meta = (customer.metadataJson || {});
                // 1. Birthday Check
                if (meta['birthday']) {
                    try {
                        const bdayDate = new Date(meta['birthday']);
                        if (bdayDate.getMonth() + 1 === todayMonth && bdayDate.getDate() === todayDay) {
                            // Match! Send Message
                            const msg = `Happy Birthday, ${customer.name}! 🎂 Celebrate your special day at Ordio and enjoy 15% off your next meal! Code: BDAY15`;
                            console.log(`[SMS Gateway Simulator] Occasion: BIRTHDAY | To: ${customer.phone} | Msg: ${msg}`);
                            // Create system notification
                            yield prisma_1.prisma.notification.create({
                                data: {
                                    title: `🎉 Birthday Alert: ${customer.name}`,
                                    message: `Today is ${customer.name}'s birthday (${customer.phone}). Congratulatory message has been sent.`,
                                    type: 'SYSTEM',
                                },
                            });
                            dispatched.push({
                                id: customer.id,
                                name: customer.name,
                                phone: customer.phone,
                                email: customer.email,
                                brandId: customer.brandId,
                                type: 'BIRTHDAY',
                            });
                        }
                    }
                    catch (err) {
                        console.error(`Failed to check birthday for customer ${customer.id}:`, err);
                    }
                }
                // 2. Anniversary Check
                if (meta['anniversary']) {
                    try {
                        const annivDate = new Date(meta['anniversary']);
                        if (annivDate.getMonth() + 1 === todayMonth && annivDate.getDate() === todayDay) {
                            // Match! Send Message
                            const msg = `Happy Anniversary, ${customer.name}! 🥂 Celebrate your milestone at Ordio and enjoy a complimentary dessert! Code: ANNV20`;
                            console.log(`[SMS Gateway Simulator] Occasion: ANNIVERSARY | To: ${customer.phone} | Msg: ${msg}`);
                            // Create system notification
                            yield prisma_1.prisma.notification.create({
                                data: {
                                    title: `💍 Anniversary Alert: ${customer.name}`,
                                    message: `Today is ${customer.name}'s anniversary (${customer.phone}). Congratulatory message has been sent.`,
                                    type: 'SYSTEM',
                                },
                            });
                            dispatched.push({
                                id: customer.id,
                                name: customer.name,
                                phone: customer.phone,
                                email: customer.email,
                                brandId: customer.brandId,
                                type: 'ANNIVERSARY',
                            });
                        }
                    }
                    catch (err) {
                        console.error(`Failed to check anniversary for customer ${customer.id}:`, err);
                    }
                }
            }
            return dispatched;
        });
    }
    // Get upcoming occasions for a brand (next 30 days)
    getUpcomingOccasions(brandId) {
        return __awaiter(this, void 0, void 0, function* () {
            const customers = yield prisma_1.prisma.customer.findMany({
                where: { brandId },
                select: { id: true, name: true, phone: true, email: true, metadataJson: true },
            });
            const now = new Date();
            const upcoming = [];
            for (const customer of customers) {
                const meta = (customer.metadataJson || {});
                if (meta['birthday']) {
                    const bday = new Date(meta['birthday']);
                    // Calculate days until next birthday
                    const days = this.daysUntilOccasion(bday, now);
                    if (days <= 30) {
                        upcoming.push({
                            customerId: customer.id,
                            name: customer.name,
                            phone: customer.phone,
                            type: 'BIRTHDAY',
                            date: meta['birthday'],
                            daysRemaining: days,
                        });
                    }
                }
                if (meta['anniversary']) {
                    const anniv = new Date(meta['anniversary']);
                    const days = this.daysUntilOccasion(anniv, now);
                    if (days <= 30) {
                        upcoming.push({
                            customerId: customer.id,
                            name: customer.name,
                            phone: customer.phone,
                            type: 'ANNIVERSARY',
                            date: meta['anniversary'],
                            daysRemaining: days,
                        });
                    }
                }
            }
            // Sort by daysRemaining ascending
            return upcoming.sort((a, b) => a.daysRemaining - b.daysRemaining);
        });
    }
    daysUntilOccasion(occasionDate, today) {
        const nextOccasion = new Date(today.getFullYear(), occasionDate.getMonth(), occasionDate.getDate());
        // If occasion already passed this year, check next year
        if (nextOccasion.getTime() < today.getTime()) {
            nextOccasion.setFullYear(today.getFullYear() + 1);
        }
        const diffMs = nextOccasion.getTime() - today.getTime();
        return Math.ceil(diffMs / (1000 * 60 * 60 * 24));
    }
}
exports.OccasionService = OccasionService;
//# sourceMappingURL=occasion.service.js.map