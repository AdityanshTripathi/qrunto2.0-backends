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
  role: UserRole;
  restaurants: Restaurant[];
}

export class AuthService {
  private generateAccessToken(user: User & { restaurants: Restaurant[] }): string {
    const restaurantId = user.restaurants[0]?.id;
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

  private generateRefreshToken(user: User): string {
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
    const accessToken = this.generateAccessToken(userWithRestaurants);
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
    // 1. Find user by email
    const user = await userRepository.findByEmail(data.email);
    if (!user) {
      throw new Error('Invalid email or password');
    }

    // 2. Verify password
    const isPasswordValid = await bcrypt.compare(data.password, user.password);
    if (!isPasswordValid) {
      throw new Error('Invalid email or password');
    }

    // 3. Generate tokens
    const accessToken = this.generateAccessToken(user);
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

  async refresh(refreshToken: string): Promise<{ accessToken: string }> {
    try {
      // 1. Verify Refresh Token
      const decoded = jwt.verify(refreshToken, JWT_REFRESH_SECRET) as { id: string };
      
      // 2. Find User
      const user = await userRepository.findById(decoded.id);
      if (!user) {
        throw new Error('User not found');
      }

      // Fetch restaurants for token payload
      const fullUser = await userRepository.findByEmail(user.email);
      if (!fullUser) {
        throw new Error('User not found');
      }

      // 3. Generate new Access Token
      const accessToken = this.generateAccessToken(fullUser);

      return { accessToken };
    } catch (err) {
      throw new Error('Invalid or expired refresh token');
    }
  }
}
