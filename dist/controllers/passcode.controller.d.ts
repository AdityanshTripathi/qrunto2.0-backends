import { Request, Response } from 'express';
export declare class PasscodeController {
    getPasscodeStatus(req: Request, res: Response): Promise<void>;
    setPasscode(req: Request, res: Response): Promise<void>;
    togglePasscode(req: Request, res: Response): Promise<void>;
    verifyPasscode(req: Request, res: Response): Promise<void>;
    createResetRequest(req: Request, res: Response): Promise<void>;
}
//# sourceMappingURL=passcode.controller.d.ts.map