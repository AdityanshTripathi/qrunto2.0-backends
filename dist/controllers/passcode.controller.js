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
exports.PasscodeController = void 0;
const zod_1 = require("zod");
const bcrypt_1 = __importDefault(require("bcrypt"));
const prisma_1 = require("../lib/prisma");
const client_1 = require("@prisma/client");
// Validation schemas
const SetPasscodeSchema = zod_1.z.object({
    passcode: zod_1.z.string().min(4, 'Passcode must be at least 4 characters').max(20, 'Passcode cannot exceed 20 characters'),
    oldPasscode: zod_1.z.string().optional(),
});
const VerifyPasscodeSchema = zod_1.z.object({
    passcode: zod_1.z.string(),
});
class PasscodeController {
    // ─── GET /api/settings/passcode/status ──────────────────────────────────────
    getPasscodeStatus(req, res) {
        return __awaiter(this, void 0, void 0, function* () {
            var _a;
            try {
                if (!req.user || !req.user.restaurantId) {
                    res.status(401).json({ error: 'Unauthorized' });
                    return;
                }
                const restaurantId = req.user.restaurantId;
                const settings = yield prisma_1.prisma.restaurantSetting.findUnique({
                    where: { restaurantId },
                    select: {
                        isPasscodeEnabled: true,
                        passcode: true,
                    },
                });
                // Fetch any pending or approved reset request
                const activeRequest = yield prisma_1.prisma.passcodeResetRequest.findFirst({
                    where: {
                        restaurantId,
                        status: {
                            in: [client_1.PasscodeResetStatus.PENDING, client_1.PasscodeResetStatus.APPROVED],
                        },
                    },
                    orderBy: { requestedAt: 'desc' },
                });
                res.status(200).json({
                    isPasscodeEnabled: (_a = settings === null || settings === void 0 ? void 0 : settings.isPasscodeEnabled) !== null && _a !== void 0 ? _a : false,
                    hasPasscodeSet: !!(settings === null || settings === void 0 ? void 0 : settings.passcode),
                    activeRequest: activeRequest
                        ? {
                            id: activeRequest.id,
                            status: activeRequest.status,
                            requestedAt: activeRequest.requestedAt,
                        }
                        : null,
                });
            }
            catch (err) {
                res.status(500).json({ error: err.message });
            }
        });
    }
    // ─── POST /api/settings/passcode/set ────────────────────────────────────────
    setPasscode(req, res) {
        return __awaiter(this, void 0, void 0, function* () {
            try {
                if (!req.user || !req.user.restaurantId) {
                    res.status(401).json({ error: 'Unauthorized' });
                    return;
                }
                const restaurantId = req.user.restaurantId;
                const validation = SetPasscodeSchema.safeParse(req.body);
                if (!validation.success) {
                    res.status(400).json({ errors: validation.error.flatten().fieldErrors });
                    return;
                }
                const { passcode, oldPasscode } = validation.data;
                const settings = yield prisma_1.prisma.restaurantSetting.findUnique({
                    where: { restaurantId },
                });
                // Check if there is an approved reset request
                const approvedRequest = yield prisma_1.prisma.passcodeResetRequest.findFirst({
                    where: {
                        restaurantId,
                        status: client_1.PasscodeResetStatus.APPROVED,
                    },
                    orderBy: { requestedAt: 'desc' },
                });
                // If passcode is already set, and there's no approved reset request, verify old passcode
                if ((settings === null || settings === void 0 ? void 0 : settings.passcode) && !approvedRequest) {
                    if (!oldPasscode) {
                        res.status(400).json({ error: 'Current passcode is required to set a new one.' });
                        return;
                    }
                    const isMatch = yield bcrypt_1.default.compare(oldPasscode, settings.passcode);
                    if (!isMatch) {
                        res.status(400).json({ error: 'Current passcode is incorrect.' });
                        return;
                    }
                }
                // Hash the new passcode
                const hashedPasscode = yield bcrypt_1.default.hash(passcode, 10);
                // Perform transaction to save new passcode and complete approved requests
                yield prisma_1.prisma.$transaction((tx) => __awaiter(this, void 0, void 0, function* () {
                    // Save passcode and enable it by default
                    yield tx.restaurantSetting.upsert({
                        where: { restaurantId },
                        update: {
                            passcode: hashedPasscode,
                            isPasscodeEnabled: true,
                        },
                        create: {
                            restaurantId,
                            passcode: hashedPasscode,
                            isPasscodeEnabled: true,
                        },
                    });
                    // Mark approved request as completed if it existed
                    if (approvedRequest) {
                        yield tx.passcodeResetRequest.update({
                            where: { id: approvedRequest.id },
                            data: {
                                status: client_1.PasscodeResetStatus.COMPLETED,
                                processedAt: new Date(),
                            },
                        });
                    }
                }));
                res.status(200).json({ message: 'Passcode updated and enabled successfully!' });
            }
            catch (err) {
                res.status(500).json({ error: err.message });
            }
        });
    }
    // ─── POST /api/settings/passcode/toggle ──────────────────────────────────────
    togglePasscode(req, res) {
        return __awaiter(this, void 0, void 0, function* () {
            try {
                if (!req.user || !req.user.restaurantId) {
                    res.status(401).json({ error: 'Unauthorized' });
                    return;
                }
                const restaurantId = req.user.restaurantId;
                const { isPasscodeEnabled, passcode } = req.body;
                if (typeof isPasscodeEnabled !== 'boolean') {
                    res.status(400).json({ error: 'isPasscodeEnabled boolean parameter required' });
                    return;
                }
                const settings = yield prisma_1.prisma.restaurantSetting.findUnique({
                    where: { restaurantId },
                });
                if (!(settings === null || settings === void 0 ? void 0 : settings.passcode)) {
                    res.status(400).json({ error: 'Passcode must be set before enabling lock.' });
                    return;
                }
                // If disabling or enabling, require passcode verification
                if (!passcode) {
                    res.status(400).json({ error: 'Passcode verification is required to toggle this setting.' });
                    return;
                }
                const isMatch = yield bcrypt_1.default.compare(passcode, settings.passcode);
                if (!isMatch) {
                    res.status(400).json({ error: 'Incorrect passcode.' });
                    return;
                }
                const updated = yield prisma_1.prisma.restaurantSetting.update({
                    where: { restaurantId },
                    data: { isPasscodeEnabled },
                });
                res.status(200).json({
                    message: `Passcode lock ${updated.isPasscodeEnabled ? 'enabled' : 'disabled'} successfully!`,
                    isPasscodeEnabled: updated.isPasscodeEnabled,
                });
            }
            catch (err) {
                res.status(500).json({ error: err.message });
            }
        });
    }
    // ─── POST /api/settings/passcode/verify ─────────────────────────────────────
    verifyPasscode(req, res) {
        return __awaiter(this, void 0, void 0, function* () {
            try {
                if (!req.user || !req.user.restaurantId) {
                    res.status(401).json({ error: 'Unauthorized' });
                    return;
                }
                const restaurantId = req.user.restaurantId;
                const validation = VerifyPasscodeSchema.safeParse(req.body);
                if (!validation.success) {
                    res.status(400).json({ error: 'Passcode is required.' });
                    return;
                }
                const { passcode } = validation.data;
                const settings = yield prisma_1.prisma.restaurantSetting.findUnique({
                    where: { restaurantId },
                });
                if (!(settings === null || settings === void 0 ? void 0 : settings.passcode)) {
                    res.status(400).json({ error: 'Passcode is not set for this restaurant.' });
                    return;
                }
                const isMatch = yield bcrypt_1.default.compare(passcode, settings.passcode);
                if (!isMatch) {
                    res.status(400).json({ error: 'Incorrect passcode.' });
                    return;
                }
                res.status(200).json({ success: true, message: 'Passcode verified successfully!' });
            }
            catch (err) {
                res.status(500).json({ error: err.message });
            }
        });
    }
    // ─── POST /api/settings/passcode/reset-request ──────────────────────────────
    createResetRequest(req, res) {
        return __awaiter(this, void 0, void 0, function* () {
            try {
                if (!req.user || !req.user.restaurantId) {
                    res.status(401).json({ error: 'Unauthorized' });
                    return;
                }
                const restaurantId = req.user.restaurantId;
                // Check if there is already an active pending request
                const existing = yield prisma_1.prisma.passcodeResetRequest.findFirst({
                    where: {
                        restaurantId,
                        status: client_1.PasscodeResetStatus.PENDING,
                    },
                });
                if (existing) {
                    res.status(400).json({
                        error: 'A passcode reset request is already pending super admin approval.',
                        request: existing,
                    });
                    return;
                }
                const newRequest = yield prisma_1.prisma.passcodeResetRequest.create({
                    data: {
                        restaurantId,
                        status: client_1.PasscodeResetStatus.PENDING,
                    },
                });
                res.status(201).json({
                    message: 'Passcode reset request submitted to super admin successfully.',
                    request: newRequest,
                });
            }
            catch (err) {
                res.status(500).json({ error: err.message });
            }
        });
    }
}
exports.PasscodeController = PasscodeController;
//# sourceMappingURL=passcode.controller.js.map