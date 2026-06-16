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
        var _a;
        const restaurantId = (_a = user.restaurants[0]) === null || _a === void 0 ? void 0 : _a.id;
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
            const accessToken = this.generateAccessToken(userWithRestaurants);
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
            // 1. Find user by email
            const user = yield userRepository.findByEmail(data.email);
            if (!user) {
                throw new Error('Invalid email or password');
            }
            // 2. Verify password
            const isPasswordValid = yield bcrypt_1.default.compare(data.password, user.password);
            if (!isPasswordValid) {
                throw new Error('Invalid email or password');
            }
            // 3. Generate tokens
            const accessToken = this.generateAccessToken(user);
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
        });
    }
    refresh(refreshToken) {
        return __awaiter(this, void 0, void 0, function* () {
            try {
                // 1. Verify Refresh Token
                const decoded = jsonwebtoken_1.default.verify(refreshToken, JWT_REFRESH_SECRET);
                // 2. Find User
                const user = yield userRepository.findById(decoded.id);
                if (!user) {
                    throw new Error('User not found');
                }
                // Fetch restaurants for token payload
                const fullUser = yield userRepository.findByEmail(user.email);
                if (!fullUser) {
                    throw new Error('User not found');
                }
                // 3. Generate new Access Token
                const accessToken = this.generateAccessToken(fullUser);
                return { accessToken };
            }
            catch (err) {
                throw new Error('Invalid or expired refresh token');
            }
        });
    }
}
exports.AuthService = AuthService;
//# sourceMappingURL=auth.service.js.map