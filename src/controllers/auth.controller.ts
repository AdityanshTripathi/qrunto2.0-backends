import { Request, Response } from 'express';
import { z } from 'zod';
import { AuthService } from '../services/auth.service';
import { UserRepository } from '../repositories/user.repository';

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

const RefreshSchema = z.object({
  refreshToken: z.string().min(1, 'Refresh token is required'),
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
      res.status(201).json(result);
    } catch (err: any) {
      res.status(400).json({ error: err.message });
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
      res.status(200).json(result);
    } catch (err: any) {
      res.status(401).json({ error: err.message });
    }
  }

  async refresh(req: Request, res: Response): Promise<void> {
    try {
      // 1. Validate request body
      const validationResult = RefreshSchema.safeParse(req.body);
      if (!validationResult.success) {
        res.status(400).json({ errors: validationResult.error.flatten().fieldErrors });
        return;
      }

      // 2. Call service
      const result = await authService.refresh(validationResult.data.refreshToken);
      res.status(200).json(result);
    } catch (err: any) {
      res.status(401).json({ error: err.message });
    }
  }

  async logout(req: Request, res: Response): Promise<void> {
    // Stateless JWT logout is handled client-side by deleting the tokens.
    // We just return a success message.
    res.status(200).json({ message: 'Successfully logged out' });
  }

  async me(req: Request, res: Response): Promise<void> {
    try {
      if (!req.user) {
        res.status(401).json({ error: 'Unauthorized' });
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
        },
      });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  }
}
