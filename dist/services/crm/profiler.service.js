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
exports.ProfilerService = void 0;
const prisma_1 = require("../../lib/prisma");
class ProfilerService {
    /**
     * Links or creates a customer profile during order checkout under the restaurant/brand context.
     * If a customer exists with this phone number under the brand, returns their customer ID.
     * If not, creates a new Customer and a CustomerRestaurantProfile, then returns the ID.
     */
    linkOrCreateCustomer(restaurantId, phone, name, email) {
        return __awaiter(this, void 0, void 0, function* () {
            const formattedPhone = phone.trim();
            if (!formattedPhone) {
                throw new Error('Phone number is required for customer linking');
            }
            // 1. Fetch restaurant to get its brandId
            const restaurant = yield prisma_1.prisma.restaurant.findUnique({
                where: { id: restaurantId },
                select: { brandId: true, name: true },
            });
            if (!restaurant) {
                throw new Error('Restaurant not found');
            }
            // Fallback brand creation if not set (highly safe fallback)
            let brandId = restaurant.brandId;
            if (!brandId) {
                const defaultBrand = yield prisma_1.prisma.brand.create({
                    data: {
                        name: `${restaurant.name} Brand`,
                    },
                });
                brandId = defaultBrand.id;
                // Update restaurant's brandId
                yield prisma_1.prisma.restaurant.update({
                    where: { id: restaurantId },
                    data: { brandId: brandId },
                });
            }
            // 2. Find or Create Customer at the Brand level
            let customer = yield prisma_1.prisma.customer.findUnique({
                where: {
                    brandId_phone: {
                        brandId,
                        phone: formattedPhone,
                    },
                },
            });
            if (!customer) {
                const cleanName = (name.trim() || 'REF').replace(/[^A-Z]/gi, '').toUpperCase().slice(0, 4);
                const cleanPhone = formattedPhone.slice(-4) || '1234';
                const referralCode = `ORDIO-${cleanName}-${cleanPhone}`;
                customer = yield prisma_1.prisma.customer.create({
                    data: {
                        brandId,
                        phone: formattedPhone,
                        name: name.trim() || 'Anonymous Customer',
                        email: (email === null || email === void 0 ? void 0 : email.trim()) || null,
                        acquisitionSource: 'QR_ORDER',
                        metadataJson: {
                            referralCode,
                        },
                    },
                });
            }
            else {
                const meta = (customer.metadataJson || {});
                if (!meta['referralCode']) {
                    const cleanName = (customer.name || 'REF').replace(/[^A-Z]/gi, '').toUpperCase().slice(0, 4);
                    const cleanPhone = customer.phone.slice(-4) || '1234';
                    const referralCode = `ORDIO-${cleanName}-${cleanPhone}`;
                    const updatePayload = {
                        metadataJson: Object.assign(Object.assign({}, meta), { referralCode })
                    };
                    if (customer.name === 'Anonymous Customer' && name.trim() && name.trim() !== 'Anonymous Customer') {
                        updatePayload.name = name.trim();
                    }
                    customer = yield prisma_1.prisma.customer.update({
                        where: { id: customer.id },
                        data: updatePayload,
                    });
                }
                else if (customer.name === 'Anonymous Customer' && name.trim() && name.trim() !== 'Anonymous Customer') {
                    // Update name if we get a better one
                    customer = yield prisma_1.prisma.customer.update({
                        where: { id: customer.id },
                        data: { name: name.trim() },
                    });
                }
            }
            // 3. Ensure Customer Restaurant Profile exists
            yield prisma_1.prisma.customerRestaurantProfile.upsert({
                where: {
                    customerId_restaurantId: {
                        customerId: customer.id,
                        restaurantId: restaurantId,
                    },
                },
                update: {}, // No updates needed during silent creation
                create: {
                    customerId: customer.id,
                    restaurantId: restaurantId,
                    totalSpend: 0,
                    totalOrders: 0,
                    aov: 0,
                    ltv: 0,
                    firstVisit: new Date(),
                    lastVisit: new Date(),
                    visitFrequency: 0,
                    repeatStatus: 'NEW',
                    healthScore: 100,
                    engagementScore: 5,
                },
            });
            return customer.id;
        });
    }
}
exports.ProfilerService = ProfilerService;
//# sourceMappingURL=profiler.service.js.map