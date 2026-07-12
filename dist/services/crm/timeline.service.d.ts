export type TimelineEventType = 'ORDER' | 'NOTE' | 'REGISTRATION' | 'LOYALTY';
export interface TimelineEvent {
    id: string;
    type: TimelineEventType;
    title: string;
    description: string;
    timestamp: Date;
    metadata?: any;
}
export declare class TimelineService {
    getCustomerTimeline(customerId: string, brandId: string): Promise<TimelineEvent[]>;
}
//# sourceMappingURL=timeline.service.d.ts.map