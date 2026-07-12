import { Request, Response } from 'express';
export declare class SuperAdminController {
    getDashboardStats(req: Request, res: Response): Promise<void>;
    getRestaurants(req: Request, res: Response): Promise<void>;
    toggleRestaurantStatus(req: Request, res: Response): Promise<void>;
    generateLoginAsToken(req: Request, res: Response): Promise<void>;
    createPlan(req: Request, res: Response): Promise<void>;
    updatePlan(req: Request, res: Response): Promise<void>;
    generateLicenseCode(req: Request, res: Response): Promise<void>;
    listLicenseCodes(req: Request, res: Response): Promise<void>;
    getTransactions(req: Request, res: Response): Promise<void>;
    deleteRestaurant(req: Request, res: Response): Promise<void>;
    deletePlan(req: Request, res: Response): Promise<void>;
    deleteLicenseCode(req: Request, res: Response): Promise<void>;
    getPasscodeResets(req: Request, res: Response): Promise<void>;
    handlePasscodeReset(req: Request, res: Response): Promise<void>;
    updateRestaurantSubscription(req: Request, res: Response): Promise<void>;
}
//# sourceMappingURL=superadmin.controller.d.ts.map