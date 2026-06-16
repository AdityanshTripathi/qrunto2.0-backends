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
exports.SettingsController = void 0;
const zod_1 = require("zod");
const prisma_1 = require("../lib/prisma");
// ─── Zod Schema for Settings Update ──────────────────────────────────────────
const UpdateSettingsSchema = zod_1.z.object({
    // Restaurant Profile Details
    name: zod_1.z.string().min(2, 'Restaurant name must be at least 2 characters').optional(),
    phone: zod_1.z.string().nullable().optional(),
    email: zod_1.z.string().email('Invalid email address').nullable().optional(),
    address: zod_1.z.string().nullable().optional(),
    gstNumber: zod_1.z.string().nullable().optional(),
    logoUrl: zod_1.z.string().nullable().optional(),
    // Restaurant Settings
    currency: zod_1.z.string().min(1, 'Currency is required').optional(),
    taxPercentage: zod_1.z.number().min(0, 'Tax percentage cannot be negative').max(100, 'Tax percentage cannot exceed 100').optional(),
    businessHours: zod_1.z.any().optional(),
    themeSettings: zod_1.z.any().optional(),
});
class SettingsController {
    // ─── GET /api/settings ──────────────────────────────────────────────────────
    getSettings(req, res) {
        return __awaiter(this, void 0, void 0, function* () {
            try {
                if (!req.user) {
                    res.status(401).json({ error: 'Authentication required' });
                    return;
                }
                const restaurantId = req.user.restaurantId;
                if (!restaurantId) {
                    res.status(400).json({ error: 'No restaurant linked to this session' });
                    return;
                }
                // Fetch restaurant with settings
                let restaurant = yield prisma_1.prisma.restaurant.findUnique({
                    where: { id: restaurantId },
                    include: { settings: true },
                });
                if (!restaurant) {
                    res.status(404).json({ error: 'Restaurant not found' });
                    return;
                }
                // Auto-create settings if not found
                if (!restaurant.settings) {
                    const createdSettings = yield prisma_1.prisma.restaurantSetting.create({
                        data: {
                            restaurantId: restaurant.id,
                            currency: 'INR',
                            taxPercentage: 0,
                        },
                    });
                    restaurant.settings = createdSettings;
                }
                res.status(200).json({
                    restaurant: {
                        id: restaurant.id,
                        name: restaurant.name,
                        slug: restaurant.slug,
                        logoUrl: restaurant.logoUrl,
                        phone: restaurant.phone,
                        email: restaurant.email,
                        address: restaurant.address,
                        gstNumber: restaurant.gstNumber,
                    },
                    settings: restaurant.settings,
                });
            }
            catch (err) {
                res.status(500).json({ error: err.message });
            }
        });
    }
    // ─── PATCH /api/settings ────────────────────────────────────────────────────
    updateSettings(req, res) {
        return __awaiter(this, void 0, void 0, function* () {
            try {
                if (!req.user) {
                    res.status(401).json({ error: 'Authentication required' });
                    return;
                }
                const restaurantId = req.user.restaurantId;
                if (!restaurantId) {
                    res.status(400).json({ error: 'No restaurant linked to this session' });
                    return;
                }
                // Validate input
                const validationResult = UpdateSettingsSchema.safeParse(req.body);
                if (!validationResult.success) {
                    res.status(400).json({ errors: validationResult.error.flatten().fieldErrors });
                    return;
                }
                const data = validationResult.data;
                // Split restaurant fields and settings fields
                const restaurantFields = {};
                if (data.name !== undefined)
                    restaurantFields.name = data.name;
                if (data.phone !== undefined)
                    restaurantFields.phone = data.phone;
                if (data.email !== undefined)
                    restaurantFields.email = data.email;
                if (data.address !== undefined)
                    restaurantFields.address = data.address;
                if (data.gstNumber !== undefined)
                    restaurantFields.gstNumber = data.gstNumber;
                if (data.logoUrl !== undefined)
                    restaurantFields.logoUrl = data.logoUrl;
                const settingsFields = {};
                if (data.currency !== undefined)
                    settingsFields.currency = data.currency;
                if (data.taxPercentage !== undefined)
                    settingsFields.taxPercentage = data.taxPercentage;
                if (data.businessHours !== undefined)
                    settingsFields.businessHours = data.businessHours;
                if (data.themeSettings !== undefined)
                    settingsFields.themeSettings = data.themeSettings;
                // Perform transaction
                const updated = yield prisma_1.prisma.$transaction((tx) => __awaiter(this, void 0, void 0, function* () {
                    var _a, _b, _c, _d;
                    // 1. Update restaurant profile
                    const restaurantUpdate = yield tx.restaurant.update({
                        where: { id: restaurantId },
                        data: restaurantFields,
                    });
                    // 2. Upsert settings
                    const settingsUpsert = yield tx.restaurantSetting.upsert({
                        where: { restaurantId },
                        update: settingsFields,
                        create: {
                            restaurantId,
                            currency: (_a = settingsFields['currency']) !== null && _a !== void 0 ? _a : 'INR',
                            taxPercentage: (_b = settingsFields['taxPercentage']) !== null && _b !== void 0 ? _b : 0,
                            businessHours: (_c = settingsFields['businessHours']) !== null && _c !== void 0 ? _c : null,
                            themeSettings: (_d = settingsFields['themeSettings']) !== null && _d !== void 0 ? _d : null,
                        },
                    });
                    return { restaurant: restaurantUpdate, settings: settingsUpsert };
                }));
                res.status(200).json({
                    message: 'Settings updated successfully!',
                    restaurant: {
                        id: updated.restaurant.id,
                        name: updated.restaurant.name,
                        slug: updated.restaurant.slug,
                        logoUrl: updated.restaurant.logoUrl,
                        phone: updated.restaurant.phone,
                        email: updated.restaurant.email,
                        address: updated.restaurant.address,
                        gstNumber: updated.restaurant.gstNumber,
                    },
                    settings: updated.settings,
                });
            }
            catch (err) {
                res.status(500).json({ error: err.message });
            }
        });
    }
}
exports.SettingsController = SettingsController;
//# sourceMappingURL=settings.controller.js.map