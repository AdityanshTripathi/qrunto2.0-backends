import { Request, Response, NextFunction } from 'express';
import { UserRole } from '@prisma/client';
export interface DecodedUser {
    id: string;
    email: string;
    role: UserRole;
    restaurantId?: string;
}
export interface AuthenticatedRequest extends Request {
    user?: DecodedUser;
}
export declare const authenticate: (req: AuthenticatedRequest, res: Response, next: NextFunction) => void;
export declare const requireRoles: (roles: UserRole[]) => (req: AuthenticatedRequest, res: Response, next: NextFunction) => void;
declare module 'express-serve-static-core' {
    interface Request {
        user?: DecodedUser;
    }
}
//# sourceMappingURL=auth.middleware.d.ts.map