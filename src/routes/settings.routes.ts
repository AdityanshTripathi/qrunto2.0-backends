import { Router } from 'express';
import { SettingsController } from '../controllers/settings.controller';
import { PasscodeController } from '../controllers/passcode.controller';
import { authenticate } from '../middlewares/auth.middleware';

const router = Router();
const settingsController = new SettingsController();
const passcodeController = new PasscodeController();

// Require authentication for settings endpoints
router.use(authenticate);

router.get('/', (req, res) => settingsController.getSettings(req, res));
router.patch('/', (req, res) => settingsController.updateSettings(req, res));

// Passcode endpoints
router.get('/passcode/status', (req, res) => passcodeController.getPasscodeStatus(req, res));
router.post('/passcode/set', (req, res) => passcodeController.setPasscode(req, res));
router.post('/passcode/toggle', (req, res) => passcodeController.togglePasscode(req, res));
router.post('/passcode/verify', (req, res) => passcodeController.verifyPasscode(req, res));
router.post('/passcode/reset-request', (req, res) => passcodeController.createResetRequest(req, res));

export default router;

