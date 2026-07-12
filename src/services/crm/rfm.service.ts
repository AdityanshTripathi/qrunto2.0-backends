import { prisma } from '../../lib/prisma';

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

export class RFMService {
  // Calculate relative RFM scores and segments for a brand
  async calculateRFM(brandId: string): Promise<RFMResult[]> {
    const customers = await prisma.customer.findMany({
      where: { brandId },
      include: {
        profiles: true,
      },
    });

    if (customers.length === 0) return [];

    const now = new Date();

    // Map customers to their raw R, F, M values
    const rawData = customers.map((c) => {
      const profile = c.profiles?.[0];
      const lastVisit = profile?.lastVisit ? new Date(profile.lastVisit) : c.createdAt;
      const recencyDays = Math.max(0, Math.floor((now.getTime() - lastVisit.getTime()) / (1000 * 60 * 60 * 24)));
      const frequency = profile?.totalOrders ?? 0;
      const monetary = profile?.totalSpend ?? 0;

      return {
        customerId: c.id,
        name: c.name,
        phone: c.phone,
        recencyDays,
        frequency,
        monetary,
        rScore: 1,
        fScore: 1,
        mScore: 1,
      };
    });

    const total = rawData.length;

    // Helper to assign 1-5 score based on sorted array percentiles (quintiles)
    // For Recency: LOWER days is BETTER, so lower index gets HIGHER score when sorting ascending
    rawData.sort((a, b) => a.recencyDays - b.recencyDays); // lowest days first
    rawData.forEach((item, index) => {
      const percentile = index / total;
      if (percentile < 0.2) item.rScore = 5;
      else if (percentile < 0.4) item.rScore = 4;
      else if (percentile < 0.6) item.rScore = 3;
      else if (percentile < 0.8) item.rScore = 2;
      else item.rScore = 1;
    });

    // For Frequency: HIGHER is BETTER, so higher index gets HIGHER score when sorting ascending
    rawData.sort((a, b) => a.frequency - b.frequency);
    rawData.forEach((item, index) => {
      const percentile = index / total;
      if (percentile < 0.2) item.fScore = 1;
      else if (percentile < 0.4) item.fScore = 2;
      else if (percentile < 0.6) item.fScore = 3;
      else if (percentile < 0.8) item.fScore = 4;
      else item.fScore = 5;
    });

    // For Monetary: HIGHER is BETTER, so higher index gets HIGHER score when sorting ascending
    rawData.sort((a, b) => a.monetary - b.monetary);
    rawData.forEach((item, index) => {
      const percentile = index / total;
      if (percentile < 0.2) item.mScore = 1;
      else if (percentile < 0.4) item.mScore = 2;
      else if (percentile < 0.6) item.mScore = 3;
      else if (percentile < 0.8) item.mScore = 4;
      else item.mScore = 5;
    });

    // Segment mappings based on R & F scores
    const results: RFMResult[] = rawData.map((item) => {
      let segment = 'Need Attention';
      const { rScore, fScore, mScore } = item;

      if (rScore >= 4 && fScore >= 4) {
        segment = 'Champions';
      } else if (rScore >= 3 && fScore >= 3) {
        segment = 'Loyal Customers';
      } else if (rScore >= 4 && fScore === 1) {
        segment = 'Recent / New';
      } else if (rScore >= 3 && fScore <= 2) {
        segment = 'Promising';
      } else if (rScore === 2 && fScore >= 3) {
        segment = 'At Risk / Churn Alert';
      } else if (rScore === 1 && fScore >= 4) {
        segment = 'Can\'t Lose Them';
      } else if (rScore <= 2 && fScore <= 2) {
        segment = 'Lost / Cold';
      }

      return {
        ...item,
        segment,
      };
    });

    // Update customer metadata with scores inside database
    for (const res of results) {
      const customer = customers.find((c) => c.id === res.customerId);
      const existingMeta = (customer?.metadataJson || {}) as Record<string, any>;
      
      await prisma.customer.update({
        where: { id: res.customerId },
        data: {
          metadataJson: {
            ...existingMeta,
            rfm: {
              rScore: res.rScore,
              fScore: res.fScore,
              mScore: res.mScore,
              segment: res.segment,
            },
          },
        },
      });
    }

    return results;
  }
}
