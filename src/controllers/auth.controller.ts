import { Request, Response } from 'express';
import { z } from 'zod';
import { AuthService } from '../services/auth.service';
import { UserRepository } from '../repositories/user.repository';
import { prisma } from '../lib/prisma';
import { restaurantTimezone, timezone } from '../lib/timezone';
import { logSafeError } from '../lib/safe-error';
import {
  clearRefreshCookie,
  hasTrustedAuthOrigin,
  readRefreshCookie,
  setRefreshCookie,
} from '../lib/auth-cookie';

const authService = new AuthService();
const userRepository = new UserRepository();

// Zod validation schemas
const RegisterSchema = z.object({
  name: z.string().min(2, 'Name must be at least 2 characters').max(50),
  email: z.string().email('Invalid email address'),
  password: z.string().min(6, 'Password must be at least 6 characters'),
  restaurantName: z.string().min(2, 'Restaurant name must be at least 2 characters').max(100),
});

const LoginSchema = z.object({
  email: z.string().email('Invalid email address'),
  password: z.string().min(1, 'Password is required'),
});

export class AuthController {
  async register(req: Request, res: Response): Promise<void> {
    try {
      // 1. Validate request body
      const validationResult = RegisterSchema.safeParse(req.body);
      if (!validationResult.success) {
        res.status(400).json({ errors: validationResult.error.flatten().fieldErrors });
        return;
      }

      // 2. Call service
      const result = await authService.register(validationResult.data);

      setRefreshCookie(
        res,
        result.tokens.refreshToken,
        result.tokens.refreshExpiresAt,
      );
      res.setHeader('Cache-Control', 'no-store');

      res.status(201).json({
        user: result.user,
        tokens: {
          accessToken: result.tokens.accessToken,
        },
      });
    } catch (error) {
      if (error instanceof Error && error.message === 'Email is already registered') {
        res.status(400).json({ error: error.message });
        return;
      }
      logSafeError('register', error, 'auth');
      res.status(500).json({ error: 'Unable to register account' });
    }
  }

  async login(req: Request, res: Response): Promise<void> {
    try {
      // 1. Validate request body
      const validationResult = LoginSchema.safeParse(req.body);
      if (!validationResult.success) {
        res.status(400).json({ errors: validationResult.error.flatten().fieldErrors });
        return;
      }

      // 2. Call service
      const result = await authService.login(validationResult.data);

      setRefreshCookie(
        res,
        result.tokens.refreshToken,
        result.tokens.refreshExpiresAt,
      );
      res.setHeader('Cache-Control', 'no-store');

      res.status(200).json({
        user: result.user,
        tokens: {
          accessToken: result.tokens.accessToken,
        },
      });
    } catch (error) {
      if (error instanceof Error && ['Invalid email or password', 'Access denied: Waiter account is disabled'].includes(error.message)) {
        res.status(401).json({ error: error.message });
        return;
      }
      logSafeError('login', error, 'auth');
      res.status(500).json({ error: 'Unable to sign in' });
    }
  }

  async refresh(req: Request, res: Response): Promise<void> {
    try {
      if (!hasTrustedAuthOrigin(req)) {
        res.status(403).json({ error: 'Untrusted request origin' });
        return;
      }

      const refreshToken = readRefreshCookie(req);
      if (!refreshToken) {
        clearRefreshCookie(res);
        res.status(401).json({
          error: 'Invalid or expired refresh token',
        });
        return;
      }

      const result = await authService.refresh(refreshToken);

      setRefreshCookie(
        res,
        result.refreshToken,
        result.refreshExpiresAt,
      );
      res.setHeader('Cache-Control', 'no-store');

      res.status(200).json({
        accessToken: result.accessToken,
      });
    } catch (error) {
      if (
        error instanceof Error &&
        error.message === 'Invalid or expired refresh token'
      ) {
        clearRefreshCookie(res);
        res.status(401).json({ error: error.message });
        return;
      }

      logSafeError('refresh', error, 'auth');
      res.status(500).json({
        error: 'Unable to refresh session',
      });
    }
  }

  async logout(req: Request, res: Response): Promise<void> {
    try {
      if (!hasTrustedAuthOrigin(req)) {
        res.status(403).json({ error: 'Untrusted request origin' });
        return;
      }

      const refreshToken = readRefreshCookie(req);

      if (refreshToken) {
        await authService.revokeRefreshToken(refreshToken);
      }

      clearRefreshCookie(res);
      res.setHeader('Cache-Control', 'no-store');

      res.status(200).json({
        message: 'Successfully logged out',
      });
    } catch (error) {
      clearRefreshCookie(res);
      logSafeError('logout', error, 'auth');

      res.status(500).json({
        error: 'Unable to complete logout',
      });
    }
  }

  async me(req: Request, res: Response): Promise<void> {
    try {
      if (!req.user) {
        res.status(401).json({ error: 'Unauthorized' });
        return;
      }

      // Check for Waiter role
      if (req.user.role === 'WAITER') {
        const waiter = await prisma.waiter.findUnique({
          where: { id: req.user.id },
          include: { restaurant: true },
        });

        if (!waiter) {
          res.status(404).json({ error: 'Waiter not found' });
          return;
        }

        if (!waiter.isActive) {
          res.status(403).json({ error: 'Access denied: Waiter account is disabled' });
          return;
        }

        res.status(200).json({
          user: {
            id: waiter.id,
            name: waiter.name,
            email: waiter.email,
            role: 'WAITER',
            restaurantTimezone: timezone(waiter.restaurant.timezone),
            restaurants: [
              {
                id: waiter.restaurant.id,
                name: waiter.restaurant.name,
                slug: waiter.restaurant.slug,
                timezone: waiter.restaurant.timezone,
                logoUrl: waiter.restaurant.logoUrl,
              },
            ],
          },
        });
        return;
      }

      // Fetch full user details from database to return to client
      const user = await userRepository.findByEmail(req.user.email);
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
          restaurantTimezone: req.user.restaurantId ? await restaurantTimezone(req.user.restaurantId) : null,
        },
      });
    } catch (err: any) {
      res.status(500).json({ error: 'Internal server error' });
    }
  }
}
