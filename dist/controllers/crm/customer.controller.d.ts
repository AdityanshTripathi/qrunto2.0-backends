import { Response } from 'express';
import { AuthenticatedRequest } from '../../middlewares/auth.middleware';
export declare class CustomerController {
    getCustomers(req: AuthenticatedRequest, res: Response): Promise<void>;
    getCustomerById(req: AuthenticatedRequest, res: Response): Promise<void>;
    updateCustomer(req: AuthenticatedRequest, res: Response): Promise<void>;
    getCustomerTimeline(req: AuthenticatedRequest, res: Response): Promise<void>;
    createCustomerNote(req: AuthenticatedRequest, res: Response): Promise<void>;
    getUpcomingOccasions(req: AuthenticatedRequest, res: Response): Promise<void>;
}
//# sourceMappingURL=customer.controller.d.ts.map