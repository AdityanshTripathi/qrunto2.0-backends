import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { UserRole } from '@prisma/client';
import { prisma, databasePoolContext } from '../lib/prisma';
import { observeOperation } from '../lib/operation-timing';

const JWT_SECRET = process.env.JWT_SECRET;

if (!JWT_SECRET) {
  throw new Error('JWT_SECRET environment variable is required');
}

export interface DecodedUser {
  id: string;
  email: string;
  role: UserRole | 'WAITER';
  restaurantId?: string;
}

export interface AuthenticatedRequest extends Request {
  user?: DecodedUser;
}

export const resolveAccessToken = async (token: string): Promise<DecodedUser> => {
  const decoded = jwt.verify(token, JWT_SECRET) as { id?: unknown };
  if (typeof decoded.id !== 'string') throw new Error('Invalid token subject');
  const userId = decoded.id;

  const user = await observeOperation('database.auth.user.lookup', () => prisma.user.findUnique({
    where: { id: userId },
    select: {
      id: true,
      email: true,
      role: true,
      restaurantId: true,
      isActive: true,
      restaurants: {
        where: { isActive: true },
        select: { id: true },
        orderBy: { createdAt: 'asc' },
        take: 1,
      },
    },
  }), { context: databasePoolContext });

  if (user) {
    if (user.isActive === false) throw new Error('User account is disabled');
    let restaurantId = user.restaurants[0]?.id;
    const primaryRestaurantId = user.restaurantId;

    // Never trust a stored primary restaurant if that restaurant is inactive.
    if (primaryRestaurantId) {
      const activePrimaryRestaurant = await observeOperation(
        'database.auth.primary-restaurant.lookup',
        () => prisma.restaurant.findFirst({
          where: {
            id: primaryRestaurantId,
            isActive: true,
          },
          select: { id: true },
        }),
        { context: databasePoolContext },
      );

      if (activePrimaryRestaurant) {
        restaurantId = activePrimaryRestaurant.id;
      }
    }
    return {
      id: user.id,
      email: user.email,
      role: user.role,
      ...(restaurantId ? { restaurantId } : {}),
    };
  }

  const waiter = await observeOperation('database.auth.waiter.lookup', () => prisma.waiter.findUnique({
    where: { id: userId },
    select: { id: true, email: true, restaurantId: true, isActive: true },
  }), { context: databasePoolContext });
  if (!waiter || !waiter.isActive) throw new Error('User account not found or disabled');

  return {
    id: waiter.id,
    email: waiter.email,
    role: 'WAITER',
    restaurantId: waiter.restaurantId,
  };
};

export const authenticate = async (req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> => {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    res.status(401).json({ error: 'Authorization token required' });
    return;
  }

  const token = authHeader.split(' ')[1];

  if (!token) {
    res.status(401).json({ error: 'Authorization token required' });
    return;
  }

  try {
    req.user = await resolveAccessToken(token);
    next();
  } catch (err) {
    res.status(401).json({ error: 'Invalid or expired authorization token' });
  }
};

export const requireRoles = (roles: (UserRole | 'WAITER')[]) => {
  return (req: AuthenticatedRequest, res: Response, next: NextFunction): void => {
    if (!req.user) {
      res.status(401).json({ error: 'Authentication required' });
      return;
    }

    if (!roles.includes(req.user.role)) {
      res.status(403).json({ error: 'Access forbidden: insufficient permissions' });
      return;
    }

    next();
  };
};

// Tenant-bound business routes must not continue with an authenticated account
// whose effective restaurant context could not be resolved.
export const requireRestaurantContext = (req: AuthenticatedRequest, res: Response, next: NextFunction): void => {
  if (!req.user) {
    res.status(401).json({ error: 'Authentication required' });
    return;
  }
  if (!req.user.restaurantId) {
    res.status(401).json({ error: 'No active restaurant linked to this session' });
    return;
  }
  next();
};

declare module 'express-serve-static-core' {
  interface Request {
    user?: DecodedUser;
  }
}
