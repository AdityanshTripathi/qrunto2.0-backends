import jwt from 'jsonwebtoken';
import bcrypt from 'bcrypt';
import { createHash, randomBytes } from 'node:crypto';
import { UserRepository } from '../repositories/user.repository';
import { UserRole, Restaurant } from '@prisma/client';
import { prisma } from '../lib/prisma';

const userRepository = new UserRepository();

const requireSecret = (name: 'JWT_SECRET'): string => {
  const value = process.env[name];
  if (!value) throw new Error(`${name} environment variable is required`);
  return value;
};

const JWT_SECRET = requireSecret('JWT_SECRET');

export interface AuthTokens {
  accessToken: string;
  refreshToken: string;
  refreshExpiresAt: Date;
}

export interface UserResponse {
  id: string;
  name: string;
  email: string;
  role: UserRole | 'WAITER';
  restaurants: Pick<Restaurant, 'id' | 'name' | 'slug' | 'logoUrl' | 'timezone'>[];
}

export class AuthService {
  private generateAccessToken(user: { id: string; email: string; role: UserRole | 'WAITER'; restaurantId?: string | undefined }): string {
    const restaurantId = user.restaurantId || undefined;
    return jwt.sign(
      {
        id: user.id,
        email: user.email,
        role: user.role,
        restaurantId,
      },
      JWT_SECRET,
      { expiresIn: '15m' }
    );
  }

  private static readonly REFRESH_SESSION_LIFETIME_MS =
    7 * 24 * 60 * 60 * 1000;

  private generateOpaqueRefreshToken(): string {
    return randomBytes(32).toString('base64url');
  }

  private hashRefreshToken(refreshToken: string): string {
    return createHash('sha256')
      .update(refreshToken, 'utf8')
      .digest('hex');
  }

  private async createRefreshSession(
    subject: { userId?: string; waiterId?: string },
    expiresAt = new Date(
      Date.now() + AuthService.REFRESH_SESSION_LIFETIME_MS
    ),
  ): Promise<{ refreshToken: string; expiresAt: Date }> {
    const hasUser = Boolean(subject.userId);
    const hasWaiter = Boolean(subject.waiterId);

    if (hasUser === hasWaiter) {
      throw new Error(
        'Refresh session must belong to exactly one account'
      );
    }

    const refreshToken = this.generateOpaqueRefreshToken();

    await prisma.authRefreshSession.create({
      data: {
        tokenHash: this.hashRefreshToken(refreshToken),
        userId: subject.userId ?? null,
        waiterId: subject.waiterId ?? null,
        expiresAt,
      },
    });

    return { refreshToken, expiresAt };
  }

  async revokeRefreshToken(refreshToken: string): Promise<void> {
    if (!refreshToken) return;

    await prisma.authRefreshSession.updateMany({
      where: {
        tokenHash: this.hashRefreshToken(refreshToken),
        revokedAt: null,
      },
      data: {
        revokedAt: new Date(),
      },
    });
  }

  private slugify(text: string): string {
    return text
      .toLowerCase()
      .trim()
      .replace(/[^\w\s-]/g, '') // Remove non-word chars
      .replace(/[\s_-]+/g, '-') // Replace spaces and underscores with hyphens
      .replace(/^-+|-+$/g, ''); // Trim leading/trailing hyphens
  }

  private async generateUniqueSlug(restaurantName: string): Promise<string> {
    const baseSlug = this.slugify(restaurantName) || 'restaurant';
    let slug = baseSlug;
    let count = 0;

    while (true) {
      const existing = await prisma.restaurant.findUnique({
        where: { slug },
      });
      if (!existing) {
        return slug;
      }
      count++;
      slug = `${baseSlug}-${count}`;
    }
  }

  async register(data: {
    name: string;
    email: string;
    password: string;
    restaurantName: string;
  }): Promise<{ user: UserResponse; tokens: AuthTokens }> {
    // 1. Check if user already exists
    const existingUser = await userRepository.findByEmail(data.email);
    if (existingUser) {
      throw new Error('Email is already registered');
    }

    // 2. Hash password
    const passwordHash = await bcrypt.hash(data.password, 10);

    // 3. Generate unique restaurant slug
    const slug = await this.generateUniqueSlug(data.restaurantName);

    // 4. Create User and Restaurant in a transaction
    const { user, restaurant } = await userRepository.createUserWithRestaurant(
      {
        name: data.name,
        email: data.email,
        password: passwordHash,
        role: UserRole.RESTAURANT_OWNER,
      },
      data.restaurantName,
      slug
    );

    const userWithRestaurants = {
      ...user,
      restaurants: [restaurant],
    };

    // 5. Generate tokens
    const accessToken = this.generateAccessToken({
      id: userWithRestaurants.id,
      email: userWithRestaurants.email,
      role: userWithRestaurants.role,
      restaurantId: userWithRestaurants.restaurants[0]?.id,
    });
    const refreshSession = await this.createRefreshSession({ userId: user.id });
    const refreshToken = refreshSession.refreshToken;

    return {
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        role: user.role,
        restaurants: [restaurant],
      },
      tokens: {
        accessToken,
        refreshToken,
        refreshExpiresAt: refreshSession.expiresAt,
      },
    };
  }

  async login(data: {
    email: string;
    password: string;
  }): Promise<{ user: UserResponse; tokens: AuthTokens }> {
    // 1. Find user by email in User table
    const user = await userRepository.findByEmail(data.email);
    if (user) {
      // Verify password
      const isPasswordValid = await bcrypt.compare(data.password, user.password);
      if (!isPasswordValid) {
        throw new Error('Invalid email or password');
      }

      // Generate tokens
      const accessToken = this.generateAccessToken({
        id: user.id,
        email: user.email,
        role: user.role,
        restaurantId: user.restaurantId || user.restaurants[0]?.id,
      });
      const refreshSession = await this.createRefreshSession({ userId: user.id });
    const refreshToken = refreshSession.refreshToken;

      return {
        user: {
          id: user.id,
          name: user.name,
          email: user.email,
          role: user.role,
          restaurants: user.restaurants,
        },
        tokens: {
        accessToken,
        refreshToken,
        refreshExpiresAt: refreshSession.expiresAt,
      },
      };
    }

    // 2. Fall back to Waiter table
    const waiter = await prisma.waiter.findUnique({
      where: { email: data.email },
      include: { restaurant: true },
    });

    if (!waiter) {
      throw new Error('Invalid email or password');
    }

    // Block disabled waiters
    if (!waiter.isActive) {
      throw new Error('Access denied: Waiter account is disabled');
    }

    // Verify password
    const isPasswordValid = await bcrypt.compare(data.password, waiter.passwordHash);
    if (!isPasswordValid) {
      throw new Error('Invalid email or password');
    }

    // Generate tokens
    const accessToken = this.generateAccessToken({
      id: waiter.id,
      email: waiter.email,
      role: 'WAITER',
      restaurantId: waiter.restaurantId,
    });
    const refreshSession = await this.createRefreshSession({ waiterId: waiter.id });
    const refreshToken = refreshSession.refreshToken;

    return {
      user: {
        id: waiter.id,
        name: waiter.name,
        email: waiter.email,
        role: 'WAITER',
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
      tokens: {
        accessToken,
        refreshToken,
        refreshExpiresAt: refreshSession.expiresAt,
      },
    };
  }

  async refresh(
    refreshToken: string,
  ): Promise<{
    accessToken: string;
    refreshToken: string;
    refreshExpiresAt: Date;
  }> {
    const invalidRefresh = () =>
      new Error('Invalid or expired refresh token');

    const tokenHash = this.hashRefreshToken(refreshToken);
    const now = new Date();

    const session = await prisma.authRefreshSession.findUnique({
      where: { tokenHash },
    });

    if (
      !session ||
      session.revokedAt ||
      session.expiresAt <= now
    ) {
      throw invalidRefresh();
    }

    let accessToken: string;

    if (session.userId) {
      const user = await userRepository.findById(session.userId);
      if (!user) throw invalidRefresh();

      const fullUser = await userRepository.findByEmail(user.email);
      if (!fullUser) throw invalidRefresh();

      accessToken = this.generateAccessToken({
        id: fullUser.id,
        email: fullUser.email,
        role: fullUser.role,
        restaurantId:
          fullUser.restaurantId ||
          fullUser.restaurants[0]?.id,
      });
    } else if (session.waiterId) {
      const waiter = await prisma.waiter.findUnique({
        where: { id: session.waiterId },
        include: { restaurant: true },
      });

      if (!waiter || !waiter.isActive) {
        throw invalidRefresh();
      }

      accessToken = this.generateAccessToken({
        id: waiter.id,
        email: waiter.email,
        role: 'WAITER',
        restaurantId: waiter.restaurantId,
      });
    } else {
      throw invalidRefresh();
    }

    const nextRefreshToken =
      this.generateOpaqueRefreshToken();

    const nextTokenHash =
      this.hashRefreshToken(nextRefreshToken);

    await prisma.$transaction(async (tx) => {
      const revoked =
        await tx.authRefreshSession.updateMany({
          where: {
            id: session.id,
            tokenHash,
            revokedAt: null,
            expiresAt: { gt: now },
          },
          data: {
            revokedAt: now,
          },
        });

      // Only one concurrent request may consume this token.
      if (revoked.count !== 1) {
        throw invalidRefresh();
      }

      await tx.authRefreshSession.create({
        data: {
          tokenHash: nextTokenHash,
          userId: session.userId,
          waiterId: session.waiterId,
          expiresAt: session.expiresAt,
        },
      });
    });

    return {
      accessToken,
      refreshToken: nextRefreshToken,
      refreshExpiresAt: session.expiresAt,
    };
  }

}
