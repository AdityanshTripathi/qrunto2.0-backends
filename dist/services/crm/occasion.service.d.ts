export interface OccasionCustomer {
    id: string;
    name: string;
    phone: string;
    email: string | null;
    brandId: string;
    type: 'BIRTHDAY' | 'ANNIVERSARY';
}
export declare class OccasionService {
    checkAndSendOccasionMessages(): Promise<OccasionCustomer[]>;
    getUpcomingOccasions(brandId: string): Promise<any[]>;
    private daysUntilOccasion;
}
//# sourceMappingURL=occasion.service.d.ts.map