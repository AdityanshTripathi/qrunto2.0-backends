export interface RFMResult {
    customerId: string;
    name: string;
    phone: string;
    recencyDays: number;
    frequency: number;
    monetary: number;
    rScore: number;
    fScore: number;
    mScore: number;
    segment: string;
}
export declare class RFMService {
    calculateRFM(brandId: string): Promise<RFMResult[]>;
}
//# sourceMappingURL=rfm.service.d.ts.map