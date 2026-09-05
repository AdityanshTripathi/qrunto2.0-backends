import { prisma } from '../../lib/prisma';
import { logSafeError } from '../../lib/safe-error';

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
      include: { brand: true },
    });

    const now = new Date();
    const todayMonth = now.getMonth() + 1; // 1-12
    const todayDay = now.getDate(); // 1-31

    const dispatched: OccasionCustomer[] = [];

    for (const customer of customers) {
      const meta = (customer.metadataJson || {}) as Record<string, any>;
      
      // 1. Birthday Check
      if (meta['birthday']) {
        try {
          const bdayDate = new Date(meta['birthday']);
          if (bdayDate.getMonth() + 1 === todayMonth && bdayDate.getDate() === todayDay) {
            // Match! Send Message
            const msg = `Happy Birthday, ${customer.name}! 🎂 Celebrate your special day at Ordio and enjoy 15% off your next meal! Code: BDAY15`;
            console.log(`[SMS Gateway Simulator] Occasion: BIRTHDAY | To: ${customer.phone} | Msg: ${msg}`);
            
            // Create system notification
            await prisma.notification.create({
              data: {
                title: `🎉 Birthday Alert: ${customer.name}`,
                message: `Today is ${customer.name}'s birthday (${customer.phone}). Congratulatory message has been sent.`,
                type: 'SYSTEM',
              },
            });

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
          logSafeError('occasion.birthday', err);
        }
      }

      // 2. Anniversary Check
      if (meta['anniversary']) {
        try {
          const annivDate = new Date(meta['anniversary']);
          if (annivDate.getMonth() + 1 === todayMonth && annivDate.getDate() === todayDay) {
            // Match! Send Message
            const msg = `Happy Anniversary, ${customer.name}! 🥂 Celebrate your milestone at Ordio and enjoy a complimentary dessert! Code: ANNV20`;
            console.log(`[SMS Gateway Simulator] Occasion: ANNIVERSARY | To: ${customer.phone} | Msg: ${msg}`);
            
            // Create system notification
            await prisma.notification.create({
              data: {
                title: `💍 Anniversary Alert: ${customer.name}`,
                message: `Today is ${customer.name}'s anniversary (${customer.phone}). Congratulatory message has been sent.`,
                type: 'SYSTEM',
              },
            });

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
          logSafeError('occasion.anniversary', err);
        }
      }
    }

    return dispatched;
  }

  // Get upcoming occasions for a brand (next 30 days)
  async getUpcomingOccasions(brandId: string): Promise<any[]> {
    const customers = await prisma.customer.findMany({
      where: { brandId },
      select: { id: true, name: true, phone: true, email: true, metadataJson: true },
    });

    const now = new Date();
    const upcoming: any[] = [];

    for (const customer of customers) {
      const meta = (customer.metadataJson || {}) as Record<string, any>;
      
      if (meta['birthday']) {
        const bday = new Date(meta['birthday']);
        // Calculate days until next birthday
        const days = this.daysUntilOccasion(bday, now);
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
        const anniv = new Date(meta['anniversary']);
        const days = this.daysUntilOccasion(anniv, now);
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

  private daysUntilOccasion(occasionDate: Date, today: Date): number {
    const nextOccasion = new Date(today.getFullYear(), occasionDate.getMonth(), occasionDate.getDate());
    
    // If occasion already passed this year, check next year
    if (nextOccasion.getTime() < today.getTime()) {
      nextOccasion.setFullYear(today.getFullYear() + 1);
    }

    const diffMs = nextOccasion.getTime() - today.getTime();
    return Math.ceil(diffMs / (1000 * 60 * 60 * 24));
  }
}
