import { localDate, occasionDays, timezone } from '../../lib/timezone';
import { prisma } from '../../lib/prisma';
import { logSafeError, logStructured } from '../../lib/safe-error';

export interface OccasionCustomer {
  id: string;
  name: string;
  phone: string;
  email: string | null;
  brandId: string;
  type: 'BIRTHDAY' | 'ANNIVERSARY';
}

export class OccasionService {
  // Scans all customers and dispatches occasion messages if month & day match today
  async checkAndSendOccasionMessages(): Promise<OccasionCustomer[]> {
    const customers = await prisma.customer.findMany({
      include: { brand: true, profiles: { include: { restaurant: { select: { id: true, timezone: true, brandId: true } } } } },
    });

    const now = new Date();
    const dispatched: OccasionCustomer[] = [];
    let failedCount = 0;

    for (const customer of customers) {
      const zones = customer.profiles.filter(p => p.restaurant.brandId === customer.brandId).map(p => timezone(p.restaurant.timezone));
      const meta = (customer.metadataJson || {}) as Record<string, any>;
      
      // 1. Birthday Check
      if (meta['birthday']) {
        try {
          const bdayDate = new Date(meta['birthday']);
          if (zones.some(zone => localDate(now, zone).slice(5) === bdayDate.toISOString().slice(5, 10))) {
            // Match! Send Message
            // Create system notification
            await Promise.all(customer.profiles.filter(p => p.restaurant.brandId === customer.brandId && localDate(now, timezone(p.restaurant.timezone)).slice(5) === (meta['birthday'] as string).slice(5, 10)).map(p => prisma.notification.create({
              data: {
                restaurantId: p.restaurant.id,
                title: `🎉 Birthday Alert: ${customer.name}`,
                message: `Today is ${customer.name}'s birthday (${customer.phone}). Congratulatory message has been sent.`,
                type: 'SYSTEM',
              },
            })));

            dispatched.push({
              id: customer.id,
              name: customer.name,
              phone: customer.phone,
              email: customer.email,
              brandId: customer.brandId,
              type: 'BIRTHDAY',
            });
          }
        } catch (err) {
          failedCount++;
          logSafeError('occasion.birthday', err);
        }
      }

      // 2. Anniversary Check
      if (meta['anniversary']) {
        try {
          const annivDate = new Date(meta['anniversary']);
          if (zones.some(zone => localDate(now, zone).slice(5) === annivDate.toISOString().slice(5, 10))) {
            // Match! Send Message
            // Create system notification
            await Promise.all(customer.profiles.filter(p => p.restaurant.brandId === customer.brandId && localDate(now, timezone(p.restaurant.timezone)).slice(5) === (meta['anniversary'] as string).slice(5, 10)).map(p => prisma.notification.create({
              data: {
                restaurantId: p.restaurant.id,
                title: `💍 Anniversary Alert: ${customer.name}`,
                message: `Today is ${customer.name}'s anniversary (${customer.phone}). Congratulatory message has been sent.`,
                type: 'SYSTEM',
              },
            })));

            dispatched.push({
              id: customer.id,
              name: customer.name,
              phone: customer.phone,
              email: customer.email,
              brandId: customer.brandId,
              type: 'ANNIVERSARY',
            });
          }
        } catch (err) {
          failedCount++;
          logSafeError('occasion.anniversary', err);
        }
      }
    }

    logStructured(failedCount ? 'warn' : 'info', 'crm', 'occasion.scan',
      failedCount ? 'partial' : 'completed', 'Occasion scan finished',
      { customerCount: customers.length, dispatchedCount: dispatched.length, failedCount });
    return dispatched;
  }

  // Get upcoming occasions for a brand (next 30 days)
  async getUpcomingOccasions(brandId: string): Promise<any[]> {
    const customers = await prisma.customer.findMany({
      where: { brandId },
      select: { id: true, name: true, phone: true, email: true, metadataJson: true, profiles: { where: { restaurant: { brandId } }, include: { restaurant: { select: { timezone: true } } } } },
    });

    const now = new Date();
    const upcoming: any[] = [];

    for (const customer of customers) {
      const meta = (customer.metadataJson || {}) as Record<string, any>;
      
      if (meta['birthday']) {
        // Calculate days until next birthday
        const days = Math.min(...customer.profiles.map(p => occasionDays(String(meta['birthday']), now, timezone(p.restaurant.timezone))));
        if (days <= 30) {
          upcoming.push({
            customerId: customer.id,
            name: customer.name,
            phone: customer.phone,
            type: 'BIRTHDAY',
            date: meta['birthday'],
            daysRemaining: days,
          });
        }
      }

      if (meta['anniversary']) {
        const days = Math.min(...customer.profiles.map(p => occasionDays(String(meta['anniversary']), now, timezone(p.restaurant.timezone))));
        if (days <= 30) {
          upcoming.push({
            customerId: customer.id,
            name: customer.name,
            phone: customer.phone,
            type: 'ANNIVERSARY',
            date: meta['anniversary'],
            daysRemaining: days,
          });
        }
      }
    }

    // Sort by daysRemaining ascending
    return upcoming.sort((a, b) => a.daysRemaining - b.daysRemaining);
  }

}
