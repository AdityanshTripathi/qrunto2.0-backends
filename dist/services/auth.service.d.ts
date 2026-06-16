import { UserRole, Restaurant } from '@prisma/client';
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
export declare class AuthService {
    private generateAccessToken;
    private generateRefreshToken;
    private slugify;
    private generateUniqueSlug;
    register(data: {
        name: string;
        email: string;
        password: string;
        restaurantName: string;
    }): Promise<{
        user: UserResponse;
        tokens: AuthTokens;
    }>;
    login(data: {
        email: string;
        password: string;
    }): Promise<{
        user: UserResponse;
        tokens: AuthTokens;
    }>;
    refresh(refreshToken: string): Promise<{
        accessToken: string;
    }>;
}
//# sourceMappingURL=auth.service.d.ts.map