import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { UserRole } from '@prisma/client';
import { prisma } from '../lib/prisma';

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

  const user = await prisma.user.findUnique({
    where: { id: decoded.id },
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
  });

  if (user) {
    if (user.isActive === false) throw new Error('User account is disabled');
    const restaurantId = user.restaurantId ?? user.restaurants[0]?.id;
    return {
      id: user.id,
      email: user.email,
      role: user.role,
      ...(restaurantId ? { restaurantId } : {}),
    };
  }

  const waiter = await prisma.waiter.findUnique({
    where: { id: decoded.id },
    select: { id: true, email: true, restaurantId: true, isActive: true },
  });
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

declare module 'express-serve-static-core' {
  interface Request {
    user?: DecodedUser;
  }
}
