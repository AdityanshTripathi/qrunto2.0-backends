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
exports.WaiterController = void 0;
const zod_1 = require("zod");
const bcrypt_1 = __importDefault(require("bcrypt"));
const prisma_1 = require("../lib/prisma");
// Zod schemas
const CreateWaiterSchema = zod_1.z.object({
    name: zod_1.z.string().min(2, 'Name must be at least 2 characters').max(50),
    phone: zod_1.z.string().min(10, 'Phone number must be at least 10 digits').max(15),
    email: zod_1.z.string().email('Invalid email address'),
    password: zod_1.z.string().min(6, 'Password must be at least 6 characters'),
    status: zod_1.z.enum(['Active', 'Disabled']).default('Active'),
});
const UpdateWaiterSchema = zod_1.z.object({
    name: zod_1.z.string().min(2, 'Name must be at least 2 characters').max(50),
    phone: zod_1.z.string().min(10, 'Phone number must be at least 10 digits').max(15),
    email: zod_1.z.string().email('Invalid email address'),
    status: zod_1.z.enum(['Active', 'Disabled']),
});
const ResetPasswordSchema = zod_1.z.object({
    password: zod_1.z.string().min(6, 'Password must be at least 6 characters'),
});
class WaiterController {
    // GET /api/dashboard/waiters - View All Waiters
    list(req, res) {
        return __awaiter(this, void 0, void 0, function* () {
            try {
                if (!req.user || !req.user.restaurantId) {
                    res.status(400).json({ error: 'Restaurant ID is required' });
                    return;
                }
                const waiters = yield prisma_1.prisma.waiter.findMany({
                    where: { restaurantId: req.user.restaurantId },
                    orderBy: { createdAt: 'desc' },
                    select: {
                        id: true,
                        name: true,
                        email: true,
                        phone: true,
                        isActive: true,
                        createdAt: true,
                    },
                });
                res.status(200).json({ waiters });
            }
            catch (err) {
                res.status(500).json({ error: err.message });
            }
        });
    }
    // POST /api/dashboard/waiters - Create Waiter
    create(req, res) {
        return __awaiter(this, void 0, void 0, function* () {
            try {
                if (!req.user || !req.user.restaurantId) {
                    res.status(400).json({ error: 'Restaurant ID is required' });
                    return;
                }
                // Validate input
                const validationResult = CreateWaiterSchema.safeParse(req.body);
                if (!validationResult.success) {
                    res.status(400).json({ errors: validationResult.error.flatten().fieldErrors });
                    return;
                }
                const { name, email, phone, password, status } = validationResult.data;
                // Check if email already exists in User or Waiter table
                const existingUser = yield prisma_1.prisma.user.findUnique({ where: { email } });
                const existingWaiter = yield prisma_1.prisma.waiter.findUnique({ where: { email } });
                if (existingUser || existingWaiter) {
                    res.status(400).json({ error: 'Email is already in use' });
                    return;
                }
                // Hash password
                const passwordHash = yield bcrypt_1.default.hash(password, 10);
                // Create waiter record
                const waiter = yield prisma_1.prisma.waiter.create({
                    data: {
                        restaurantId: req.user.restaurantId,
                        name,
                        email,
                        phone,
                        passwordHash,
                        isActive: status === 'Active',
                    },
                    select: {
                        id: true,
                        name: true,
                        email: true,
                        phone: true,
                        isActive: true,
                        createdAt: true,
                    },
                });
                res.status(201).json({ message: 'Waiter created successfully!', waiter });
            }
            catch (err) {
                res.status(500).json({ error: err.message });
            }
        });
    }
    // PUT /api/dashboard/waiters/:id - Edit Waiter
    update(req, res) {
        return __awaiter(this, void 0, void 0, function* () {
            try {
                if (!req.user || !req.user.restaurantId) {
                    res.status(400).json({ error: 'Restaurant ID is required' });
                    return;
                }
                const id = req.params.id;
                // Validate input
                const validationResult = UpdateWaiterSchema.safeParse(req.body);
                if (!validationResult.success) {
                    res.status(400).json({ errors: validationResult.error.flatten().fieldErrors });
                    return;
                }
                const { name, email, phone, status } = validationResult.data;
                // Find waiter
                const waiter = yield prisma_1.prisma.waiter.findFirst({
                    where: { id, restaurantId: req.user.restaurantId },
                });
                if (!waiter) {
                    res.status(404).json({ error: 'Waiter not found' });
                    return;
                }
                // Check if email already exists in User or Waiter (excluding self)
                const existingUser = yield prisma_1.prisma.user.findUnique({ where: { email } });
                const existingWaiter = yield prisma_1.prisma.waiter.findFirst({
                    where: { email, NOT: { id } },
                });
                if (existingUser || existingWaiter) {
                    res.status(400).json({ error: 'Email is already in use' });
                    return;
                }
                // Update waiter record
                const updatedWaiter = yield prisma_1.prisma.waiter.update({
                    where: { id },
                    data: {
                        name,
                        email,
                        phone,
                        isActive: status === 'Active',
                    },
                    select: {
                        id: true,
                        name: true,
                        email: true,
                        phone: true,
                        isActive: true,
                        createdAt: true,
                    },
                });
                res.status(200).json({ message: 'Waiter updated successfully!', waiter: updatedWaiter });
            }
            catch (err) {
                res.status(500).json({ error: err.message });
            }
        });
    }
    // DELETE /api/dashboard/waiters/:id - Delete Waiter
    delete(req, res) {
        return __awaiter(this, void 0, void 0, function* () {
            try {
                if (!req.user || !req.user.restaurantId) {
                    res.status(400).json({ error: 'Restaurant ID is required' });
                    return;
                }
                const id = req.params.id;
                const waiter = yield prisma_1.prisma.waiter.findFirst({
                    where: { id, restaurantId: req.user.restaurantId },
                });
                if (!waiter) {
                    res.status(404).json({ error: 'Waiter not found' });
                    return;
                }
                yield prisma_1.prisma.waiter.delete({
                    where: { id },
                });
                res.status(200).json({ message: 'Waiter deleted successfully!' });
            }
            catch (err) {
                res.status(500).json({ error: err.message });
            }
        });
    }
    // PATCH /api/dashboard/waiters/:id/status - Toggle Waiter Status (Enable/Disable)
    toggleStatus(req, res) {
        return __awaiter(this, void 0, void 0, function* () {
            try {
                if (!req.user || !req.user.restaurantId) {
                    res.status(400).json({ error: 'Restaurant ID is required' });
                    return;
                }
                const id = req.params.id;
                const { isActive } = req.body;
                const waiter = yield prisma_1.prisma.waiter.findFirst({
                    where: { id, restaurantId: req.user.restaurantId },
                });
                if (!waiter) {
                    res.status(404).json({ error: 'Waiter not found' });
                    return;
                }
                const updatedWaiter = yield prisma_1.prisma.waiter.update({
                    where: { id },
                    data: {
                        isActive: Boolean(isActive),
                    },
                });
                res.status(200).json({
                    message: `Waiter ${updatedWaiter.isActive ? 'enabled' : 'disabled'} successfully!`,
                    waiter: {
                        id: updatedWaiter.id,
                        isActive: updatedWaiter.isActive,
                    },
                });
            }
            catch (err) {
                res.status(500).json({ error: err.message });
            }
        });
    }
    // POST /api/dashboard/waiters/:id/reset-password - Reset Password
    resetPassword(req, res) {
        return __awaiter(this, void 0, void 0, function* () {
            try {
                if (!req.user || !req.user.restaurantId) {
                    res.status(400).json({ error: 'Restaurant ID is required' });
                    return;
                }
                const id = req.params.id;
                const validationResult = ResetPasswordSchema.safeParse(req.body);
                if (!validationResult.success) {
                    res.status(400).json({ errors: validationResult.error.flatten().fieldErrors });
                    return;
                }
                const { password } = validationResult.data;
                const waiter = yield prisma_1.prisma.waiter.findFirst({
                    where: { id, restaurantId: req.user.restaurantId },
                });
                if (!waiter) {
                    res.status(404).json({ error: 'Waiter not found' });
                    return;
                }
                // Hash password
                const passwordHash = yield bcrypt_1.default.hash(password, 10);
                yield prisma_1.prisma.waiter.update({
                    where: { id },
                    data: {
                        passwordHash,
                    },
                });
                res.status(200).json({ message: 'Waiter password reset successfully!' });
            }
            catch (err) {
                res.status(500).json({ error: err.message });
            }
        });
    }
}
exports.WaiterController = WaiterController;
//# sourceMappingURL=waiter.controller.js.map