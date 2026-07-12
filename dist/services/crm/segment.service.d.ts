export interface SegmentCriteria {
    minSpend?: number | undefined;
    minOrders?: number | undefined;
    lastVisitDaysAgo?: number | undefined;
    visitedWithinDays?: number | undefined;
    dietary?: string | undefined;
    seating?: string | undefined;
}
export declare class SegmentService {
    createSegment(brandId: string, name: string, description: string | null, criteria: SegmentCriteria): Promise<any>;
    getSegments(brandId: string): Promise<any[]>;
    deleteSegment(brandId: string, segmentId: string): Promise<void>;
    evaluateSegment(segmentId: string, brandId: string): Promise<number>;
    evaluateAllSegmentsForBrand(brandId: string): Promise<void>;
    getSegmentMembers(brandId: string, segmentId: string): Promise<any[]>;
}
//# sourceMappingURL=segment.service.d.ts.map