"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const settings_controller_1 = require("../controllers/settings.controller");
const passcode_controller_1 = require("../controllers/passcode.controller");
const auth_middleware_1 = require("../middlewares/auth.middleware");
const router = (0, express_1.Router)();
const settingsController = new settings_controller_1.SettingsController();
const passcodeController = new passcode_controller_1.PasscodeController();
// Require authentication for settings endpoints
router.use(auth_middleware_1.authenticate);
router.get('/', (req, res) => settingsController.getSettings(req, res));
router.patch('/', (req, res) => settingsController.updateSettings(req, res));
// Passcode endpoints
router.get('/passcode/status', (req, res) => passcodeController.getPasscodeStatus(req, res));
router.post('/passcode/set', (req, res) => passcodeController.setPasscode(req, res));
router.post('/passcode/toggle', (req, res) => passcodeController.togglePasscode(req, res));
router.post('/passcode/verify', (req, res) => passcodeController.verifyPasscode(req, res));
router.post('/passcode/reset-request', (req, res) => passcodeController.createResetRequest(req, res));
exports.default = router;
//# sourceMappingURL=settings.routes.js.map