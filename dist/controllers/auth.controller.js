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
exports.AuthController = void 0;
const zod_1 = require("zod");
const auth_service_1 = require("../services/auth.service");
const user_repository_1 = require("../repositories/user.repository");
const authService = new auth_service_1.AuthService();
const userRepository = new user_repository_1.UserRepository();
// Zod validation schemas
const RegisterSchema = zod_1.z.object({
    name: zod_1.z.string().min(2, 'Name must be at least 2 characters').max(50),
    email: zod_1.z.string().email('Invalid email address'),
    password: zod_1.z.string().min(6, 'Password must be at least 6 characters'),
    restaurantName: zod_1.z.string().min(2, 'Restaurant name must be at least 2 characters').max(100),
});
const LoginSchema = zod_1.z.object({
    email: zod_1.z.string().email('Invalid email address'),
    password: zod_1.z.string().min(1, 'Password is required'),
});
const RefreshSchema = zod_1.z.object({
    refreshToken: zod_1.z.string().min(1, 'Refresh token is required'),
});
class AuthController {
    register(req, res) {
        return __awaiter(this, void 0, void 0, function* () {
            try {
                // 1. Validate request body
                const validationResult = RegisterSchema.safeParse(req.body);
                if (!validationResult.success) {
                    res.status(400).json({ errors: validationResult.error.flatten().fieldErrors });
                    return;
                }
                // 2. Call service
                const result = yield authService.register(validationResult.data);
                res.status(201).json(result);
            }
            catch (err) {
                res.status(400).json({ error: err.message });
            }
        });
    }
    login(req, res) {
        return __awaiter(this, void 0, void 0, function* () {
            try {
                // 1. Validate request body
                const validationResult = LoginSchema.safeParse(req.body);
                if (!validationResult.success) {
                    res.status(400).json({ errors: validationResult.error.flatten().fieldErrors });
                    return;
                }
                // 2. Call service
                const result = yield authService.login(validationResult.data);
                res.status(200).json(result);
            }
            catch (err) {
                res.status(401).json({ error: err.message });
            }
        });
    }
    refresh(req, res) {
        return __awaiter(this, void 0, void 0, function* () {
            try {
                // 1. Validate request body
                const validationResult = RefreshSchema.safeParse(req.body);
                if (!validationResult.success) {
                    res.status(400).json({ errors: validationResult.error.flatten().fieldErrors });
                    return;
                }
                // 2. Call service
                const result = yield authService.refresh(validationResult.data.refreshToken);
                res.status(200).json(result);
            }
            catch (err) {
                res.status(401).json({ error: err.message });
            }
        });
    }
    logout(req, res) {
        return __awaiter(this, void 0, void 0, function* () {
            // Stateless JWT logout is handled client-side by deleting the tokens.
            // We just return a success message.
            res.status(200).json({ message: 'Successfully logged out' });
        });
    }
    me(req, res) {
        return __awaiter(this, void 0, void 0, function* () {
            try {
                if (!req.user) {
                    res.status(401).json({ error: 'Unauthorized' });
                    return;
                }
                // Fetch full user details from database to return to client
                const user = yield userRepository.findByEmail(req.user.email);
                if (!user) {
                    res.status(404).json({ error: 'User not found' });
                    return;
                }
                res.status(200).json({
                    user: {
                        id: user.id,
                        name: user.name,
                        email: user.email,
                        role: user.role,
                        restaurants: user.restaurants,
                    },
                });
            }
            catch (err) {
                res.status(500).json({ error: err.message });
            }
        });
    }
}
exports.AuthController = AuthController;
//# sourceMappingURL=auth.controller.js.map