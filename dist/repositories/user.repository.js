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
exports.UserRepository = void 0;
const prisma_1 = require("../lib/prisma");
class UserRepository {
    findByEmail(email) {
        return __awaiter(this, void 0, void 0, function* () {
            return prisma_1.prisma.user.findUnique({
                where: { email },
                include: {
                    restaurants: true,
                },
            });
        });
    }
    findById(id) {
        return __awaiter(this, void 0, void 0, function* () {
            return prisma_1.prisma.user.findUnique({
                where: { id },
            });
        });
    }
    createUserWithRestaurant(userData, restaurantName, restaurantSlug) {
        return __awaiter(this, void 0, void 0, function* () {
            return prisma_1.prisma.$transaction((tx) => __awaiter(this, void 0, void 0, function* () {
                // 1. Create User
                const user = yield tx.user.create({
                    data: userData,
                });
                // 2. Create Restaurant owned by this User
                const restaurant = yield tx.restaurant.create({
                    data: {
                        name: restaurantName,
                        slug: restaurantSlug,
                        ownerId: user.id,
                        isActive: true,
                    },
                });
                // 3. Create default settings for this restaurant
                yield tx.restaurantSetting.create({
                    data: {
                        restaurantId: restaurant.id,
                        currency: 'INR',
                        taxPercentage: 0,
                    },
                });
                return { user, restaurant };
            }));
        });
    }
}
exports.UserRepository = UserRepository;
//# sourceMappingURL=user.repository.js.map