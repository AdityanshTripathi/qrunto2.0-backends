import jwt from 'jsonwebtoken';
import bcrypt from 'bcrypt';
import { UserRepository } from '../repositories/user.repository';
import { User, UserRole, Restaurant } from '@prisma/client';
import { prisma } from '../lib/prisma';

const userRepository = new UserRepository();

const JWT_SECRET = process.env.JWT_SECRET || 'default_jwt_secret_12345';
const JWT_REFRESH_SECRET = process.env.JWT_REFRESH_SECRET || 'default_jwt_refresh_secret_12345';

export interface AuthTokens {
  accessToken: string;
  refreshToken: string;
}

export interface UserResponse {
  id: string;
  name: string;
  email: string;
  role: UserRole | 'WAITER';
  restaurants: any[];
}

export class AuthService {
  private generateAccessToken(user: { id: string; email: string; role: any; restaurantId?: string | undefined }): string {
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

  private generateRefreshToken(user: { id: string }): string {
    return jwt.sign(
      { id: user.id },
      JWT_REFRESH_SECRET,
      { expiresIn: '7d' }
    );
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
    const refreshToken = this.generateRefreshToken(user);

    return {
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        role: user.role,
        restaurants: [restaurant],
      },
      tokens: { accessToken, refreshToken },
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
      const refreshToken = this.generateRefreshToken(user);

      return {
        user: {
          id: user.id,
          name: user.name,
          email: user.email,
          role: user.role,
          restaurants: user.restaurants,
        },
        tokens: { accessToken, refreshToken },
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
    const refreshToken = this.generateRefreshToken(waiter);

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
            logoUrl: waiter.restaurant.logoUrl,
          },
        ],
      },
      tokens: { accessToken, refreshToken },
    };
  }

  async refresh(refreshToken: string): Promise<{ accessToken: string }> {
    try {
      // 1. Verify Refresh Token
      const decoded = jwt.verify(refreshToken, JWT_REFRESH_SECRET) as { id: string };
      
      // 2. Find User in User table first
      const user = await userRepository.findById(decoded.id);
      if (user) {
        // Fetch restaurants for token payload
        const fullUser = await userRepository.findByEmail(user.email);
        if (!fullUser) {
          throw new Error('User not found');
        }
        const accessToken = this.generateAccessToken({
          id: fullUser.id,
          email: fullUser.email,
          role: fullUser.role,
          restaurantId: fullUser.restaurantId || fullUser.restaurants[0]?.id,
        });
        return { accessToken };
      }

      // 3. Find Waiter in Waiter table
      const waiter = await prisma.waiter.findUnique({
        where: { id: decoded.id },
        include: { restaurant: true },
      });

      if (waiter) {
        if (!waiter.isActive) {
          throw new Error('Access denied: Waiter account is disabled');
        }
        const accessToken = this.generateAccessToken({
          id: waiter.id,
          email: waiter.email,
          role: 'WAITER',
          restaurantId: waiter.restaurantId,
        });
        return { accessToken };
      }

      throw new Error('User/Waiter not found');
    } catch (err: any) {
      throw new Error(err.message || 'Invalid or expired refresh token');
    }
  }
}
