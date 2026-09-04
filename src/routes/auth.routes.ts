import { Router } from 'express';
import { AuthController } from '../controllers/auth.controller';
import { authenticate } from '../middlewares/auth.middleware';
import {
  loginRateLimiter,
  registrationRateLimiter,
} from '../middlewares/auth-rate-limit.middleware';

const router = Router();
const authController = new AuthController();

// Public routes
router.post('/register', registrationRateLimiter, (req, res) => authController.register(req, res));
router.post('/login', loginRateLimiter, (req, res) => authController.login(req, res));
router.post('/refresh', (req, res) => authController.refresh(req, res));
router.post('/logout', (req, res) => authController.logout(req, res));

// Protected routes
router.get('/me', authenticate, (req, res) => authController.me(req, res));

export default router;
