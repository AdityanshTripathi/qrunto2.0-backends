import { CampaignChannel } from '@prisma/client';
export interface CreateCampaignInput {
    name: string;
    channel: CampaignChannel;
    segmentId?: string | null | undefined;
    templateSubject?: string | null | undefined;
    templateBody: string;
    scheduledAt: Date;
}
export declare class CampaignService {
    createCampaign(brandId: string, data: CreateCampaignInput): Promise<any>;
    getCampaigns(brandId: string): Promise<any[]>;
    deleteCampaign(brandId: string, campaignId: string): Promise<void>;
    sendCampaign(campaignId: string, brandId: string): Promise<void>;
    processQueuedCampaigns(): Promise<void>;
    getCampaignLogs(campaignId: string, brandId: string): Promise<any[]>;
}
//# sourceMappingURL=campaign.service.d.ts.map