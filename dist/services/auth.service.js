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
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.AuthService = void 0;
const jsonwebtoken_1 = __importDefault(require("jsonwebtoken"));
const bcrypt_1 = __importDefault(require("bcrypt"));
const user_repository_1 = require("../repositories/user.repository");
const client_1 = require("@prisma/client");
const prisma_1 = require("../lib/prisma");
const userRepository = new user_repository_1.UserRepository();
const JWT_SECRET = process.env.JWT_SECRET || 'default_jwt_secret_12345';
const JWT_REFRESH_SECRET = process.env.JWT_REFRESH_SECRET || 'default_jwt_refresh_secret_12345';
class AuthService {
    generateAccessToken(user) {
        const restaurantId = user.restaurantId || undefined;
        return jsonwebtoken_1.default.sign({
            id: user.id,
            email: user.email,
            role: user.role,
            restaurantId,
        }, JWT_SECRET, { expiresIn: '15m' });
    }
    generateRefreshToken(user) {
        return jsonwebtoken_1.default.sign({ id: user.id }, JWT_REFRESH_SECRET, { expiresIn: '7d' });
    }
    slugify(text) {
        return text
            .toLowerCase()
            .trim()
            .replace(/[^\w\s-]/g, '') // Remove non-word chars
            .replace(/[\s_-]+/g, '-') // Replace spaces and underscores with hyphens
            .replace(/^-+|-+$/g, ''); // Trim leading/trailing hyphens
    }
    generateUniqueSlug(restaurantName) {
        return __awaiter(this, void 0, void 0, function* () {
            const baseSlug = this.slugify(restaurantName) || 'restaurant';
            let slug = baseSlug;
            let count = 0;
            while (true) {
                const existing = yield prisma_1.prisma.restaurant.findUnique({
                    where: { slug },
                });
                if (!existing) {
                    return slug;
                }
                count++;
                slug = `${baseSlug}-${count}`;
            }
        });
    }
    register(data) {
        return __awaiter(this, void 0, void 0, function* () {
            var _a;
            // 1. Check if user already exists
            const existingUser = yield userRepository.findByEmail(data.email);
            if (existingUser) {
                throw new Error('Email is already registered');
            }
            // 2. Hash password
            const passwordHash = yield bcrypt_1.default.hash(data.password, 10);
            // 3. Generate unique restaurant slug
            const slug = yield this.generateUniqueSlug(data.restaurantName);
            // 4. Create User and Restaurant in a transaction
            const { user, restaurant } = yield userRepository.createUserWithRestaurant({
                name: data.name,
                email: data.email,
                password: passwordHash,
                role: client_1.UserRole.RESTAURANT_OWNER,
            }, data.restaurantName, slug);
            const userWithRestaurants = Object.assign(Object.assign({}, user), { restaurants: [restaurant] });
            // 5. Generate tokens
            const accessToken = this.generateAccessToken({
                id: userWithRestaurants.id,
                email: userWithRestaurants.email,
                role: userWithRestaurants.role,
                restaurantId: (_a = userWithRestaurants.restaurants[0]) === null || _a === void 0 ? void 0 : _a.id,
            });
            const refreshToken = this.generateRefreshToken(user);
            return {
                user: {
                    id: user.id,
                    name: user.name,
                    email: user.email,
                    role: user.role,
                    restaurants: [restaurant],
                },
                tokens: { accessToken, refreshToken },
            };
        });
    }
    login(data) {
        return __awaiter(this, void 0, void 0, function* () {
            var _a;
            // 1. Find user by email in User table
            const user = yield userRepository.findByEmail(data.email);
            if (user) {
                // Verify password
                const isPasswordValid = yield bcrypt_1.default.compare(data.password, user.password);
                if (!isPasswordValid) {
                    throw new Error('Invalid email or password');
                }
                // Generate tokens
                const accessToken = this.generateAccessToken({
                    id: user.id,
                    email: user.email,
                    role: user.role,
                    restaurantId: (_a = user.restaurants[0]) === null || _a === void 0 ? void 0 : _a.id,
                });
                const refreshToken = this.generateRefreshToken(user);
                return {
                    user: {
                        id: user.id,
                        name: user.name,
                        email: user.email,
                        role: user.role,
                        restaurants: user.restaurants,
                    },
                    tokens: { accessToken, refreshToken },
                };
            }
            // 2. Fall back to Waiter table
            const waiter = yield prisma_1.prisma.waiter.findUnique({
                where: { email: data.email },
                include: { restaurant: true },
            });
            if (!waiter) {
                throw new Error('Invalid email or password');
            }
            // Block disabled waiters
            if (!waiter.isActive) {
                throw new Error('Access denied: Waiter account is disabled');
            }
            // Verify password
            const isPasswordValid = yield bcrypt_1.default.compare(data.password, waiter.passwordHash);
            if (!isPasswordValid) {
                throw new Error('Invalid email or password');
            }
            // Generate tokens
            const accessToken = this.generateAccessToken({
                id: waiter.id,
                email: waiter.email,
                role: 'WAITER',
                restaurantId: waiter.restaurantId,
            });
            const refreshToken = this.generateRefreshToken(waiter);
            return {
                user: {
                    id: waiter.id,
                    name: waiter.name,
                    email: waiter.email,
                    role: 'WAITER',
                    restaurants: [
                        {
                            id: waiter.restaurant.id,
                            name: waiter.restaurant.name,
                            slug: waiter.restaurant.slug,
                            logoUrl: waiter.restaurant.logoUrl,
                        },
                    ],
                },
                tokens: { accessToken, refreshToken },
            };
        });
    }
    refresh(refreshToken) {
        return __awaiter(this, void 0, void 0, function* () {
            var _a;
            try {
                // 1. Verify Refresh Token
                const decoded = jsonwebtoken_1.default.verify(refreshToken, JWT_REFRESH_SECRET);
                // 2. Find User in User table first
                const user = yield userRepository.findById(decoded.id);
                if (user) {
                    // Fetch restaurants for token payload
                    const fullUser = yield userRepository.findByEmail(user.email);
                    if (!fullUser) {
                        throw new Error('User not found');
                    }
                    const accessToken = this.generateAccessToken({
                        id: fullUser.id,
                        email: fullUser.email,
                        role: fullUser.role,
                        restaurantId: (_a = fullUser.restaurants[0]) === null || _a === void 0 ? void 0 : _a.id,
                    });
                    return { accessToken };
                }
                // 3. Find Waiter in Waiter table
                const waiter = yield prisma_1.prisma.waiter.findUnique({
                    where: { id: decoded.id },
                    include: { restaurant: true },
                });
                if (waiter) {
                    if (!waiter.isActive) {
                        throw new Error('Access denied: Waiter account is disabled');
                    }
                    const accessToken = this.generateAccessToken({
                        id: waiter.id,
                        email: waiter.email,
                        role: 'WAITER',
                        restaurantId: waiter.restaurantId,
                    });
                    return { accessToken };
                }
                throw new Error('User/Waiter not found');
            }
            catch (err) {
                throw new Error(err.message || 'Invalid or expired refresh token');
            }
        });
    }
}
exports.AuthService = AuthService;
//# sourceMappingURL=auth.service.js.map