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
exports.TableService = void 0;
const table_repository_1 = require("../repositories/table.repository");
const subscription_repository_1 = require("../repositories/subscription.repository");
const prisma_1 = require("../lib/prisma");
const tableRepository = new table_repository_1.TableRepository();
const subscriptionRepository = new subscription_repository_1.SubscriptionRepository();
// Base URL for QR codes - used as the value encoded in the QR
const APP_BASE_URL = process.env.APP_BASE_URL || 'https://www.ordio.in';
class TableService {
    getTables(restaurantId) {
        return __awaiter(this, void 0, void 0, function* () {
            return tableRepository.findMany(restaurantId);
        });
    }
    getTableById(id, restaurantId) {
        return __awaiter(this, void 0, void 0, function* () {
            return tableRepository.findById(id, restaurantId);
        });
    }
    createTable(restaurantId, tableNumber) {
        return __awaiter(this, void 0, void 0, function* () {
            // 1. Enforce subscription table limit
            const activeSub = yield subscriptionRepository.findActiveSubscriptionByRestaurantId(restaurantId);
            if (!activeSub) {
                throw new Error('No active subscription found. Please select a plan to add tables.');
            }
            const maxTables = activeSub.plan.maxTables;
            const currentCount = yield tableRepository.count(restaurantId);
            if (currentCount >= maxTables) {
                throw new Error(`Table limit reached. Your plan allows up to ${maxTables} tables. Please upgrade.`);
            }
            // 2. Check for duplicate table number within this restaurant
            const existing = yield tableRepository.findByTableNumber(tableNumber, restaurantId);
            if (existing) {
                throw new Error(`Table "${tableNumber}" already exists. Please use a different table number.`);
            }
            // 3. Fetch restaurant slug for QR URL generation
            const restaurant = yield prisma_1.prisma.restaurant.findUnique({
                where: { id: restaurantId },
                select: { slug: true },
            });
            if (!restaurant) {
                throw new Error('Restaurant not found');
            }
            // 4. Build the ordering URL (this is what the QR code encodes)
            const orderingUrl = `${APP_BASE_URL}/order/${restaurant.slug}/${encodeURIComponent(tableNumber)}`;
            // 5. Create table with QR URL
            return tableRepository.create({
                restaurantId,
                tableNumber,
                qrCodeUrl: orderingUrl,
            });
        });
    }
    updateTable(id, restaurantId, data) {
        return __awaiter(this, void 0, void 0, function* () {
            // 1. Verify existence
            const table = yield tableRepository.findById(id, restaurantId);
            if (!table) {
                throw new Error('Table not found or unauthorized');
            }
            // 2. If renaming the table, check for duplicates and regenerate QR URL
            const payload = {};
            if (data.tableNumber && data.tableNumber !== table.tableNumber) {
                const existing = yield tableRepository.findByTableNumber(data.tableNumber, restaurantId);
                if (existing && existing.id !== id) {
                    throw new Error(`Table "${data.tableNumber}" already exists.`);
                }
                // Regenerate QR URL with new table number
                const restaurant = yield prisma_1.prisma.restaurant.findUnique({
                    where: { id: restaurantId },
                    select: { slug: true },
                });
                if (!restaurant)
                    throw new Error('Restaurant not found');
                payload.tableNumber = data.tableNumber;
                payload.qrCodeUrl = `${APP_BASE_URL}/order/${restaurant.slug}/${encodeURIComponent(data.tableNumber)}`;
            }
            if (data.isActive !== undefined) {
                payload.isActive = data.isActive;
            }
            return tableRepository.update(id, restaurantId, payload);
        });
    }
    deleteTable(id, restaurantId) {
        return __awaiter(this, void 0, void 0, function* () {
            const table = yield tableRepository.findById(id, restaurantId);
            if (!table) {
                throw new Error('Table not found or unauthorized');
            }
            return tableRepository.softDelete(id, restaurantId);
        });
    }
}
exports.TableService = TableService;
//# sourceMappingURL=table.service.js.map