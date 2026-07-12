import { prisma } from '../../lib/prisma';

export class ProfilerService {
  /**
   * Links or creates a customer profile during order checkout under the restaurant/brand context.
   * If a customer exists with this phone number under the brand, returns their customer ID.
   * If not, creates a new Customer and a CustomerRestaurantProfile, then returns the ID.
   */
  async linkOrCreateCustomer(
    restaurantId: string,
    phone: string,
    name: string,
    email?: string
  ): Promise<string> {
    const formattedPhone = phone.trim();
    if (!formattedPhone) {
      throw new Error('Phone number is required for customer linking');
    }

    // 1. Fetch restaurant to get its brandId
    const restaurant = await prisma.restaurant.findUnique({
      where: { id: restaurantId },
      select: { brandId: true, name: true },
    });

    if (!restaurant) {
      throw new Error('Restaurant not found');
    }

    // Fallback brand creation if not set (highly safe fallback)
    let brandId = restaurant.brandId;
    if (!brandId) {
      const defaultBrand = await prisma.brand.create({
        data: {
          name: `${restaurant.name} Brand`,
        },
      });
      brandId = defaultBrand.id;
      
      // Update restaurant's brandId
      await prisma.restaurant.update({
        where: { id: restaurantId },
        data: { brandId: brandId },
      });
    }

    // 2. Find or Create Customer at the Brand level
    let customer = await prisma.customer.findUnique({
      where: {
        brandId_phone: {
          brandId,
          phone: formattedPhone,
        },
      },
    });

    if (!customer) {
      const cleanName = (name.trim() || 'REF').replace(/[^A-Z]/gi, '').toUpperCase().slice(0, 4);
      const cleanPhone = formattedPhone.slice(-4) || '1234';
      const referralCode = `ORDIO-${cleanName}-${cleanPhone}`;

      customer = await prisma.customer.create({
        data: {
          brandId,
          phone: formattedPhone,
          name: name.trim() || 'Anonymous Customer',
          email: email?.trim() || null,
          acquisitionSource: 'QR_ORDER',
          metadataJson: {
            referralCode,
          },
        },
      });
    } else {
      const meta = (customer.metadataJson || {}) as Record<string, any>;
      if (!meta['referralCode']) {
        const cleanName = (customer.name || 'REF').replace(/[^A-Z]/gi, '').toUpperCase().slice(0, 4);
        const cleanPhone = customer.phone.slice(-4) || '1234';
        const referralCode = `ORDIO-${cleanName}-${cleanPhone}`;

        const updatePayload: { name?: string; metadataJson: any } = {
          metadataJson: {
            ...meta,
            referralCode,
          }
        };
        if (customer.name === 'Anonymous Customer' && name.trim() && name.trim() !== 'Anonymous Customer') {
          updatePayload.name = name.trim();
        }

        customer = await prisma.customer.update({
          where: { id: customer.id },
          data: updatePayload,
        });
      } else if (customer.name === 'Anonymous Customer' && name.trim() && name.trim() !== 'Anonymous Customer') {
        // Update name if we get a better one
        customer = await prisma.customer.update({
          where: { id: customer.id },
          data: { name: name.trim() },
        });
      }
    }

    // 3. Ensure Customer Restaurant Profile exists
    await prisma.customerRestaurantProfile.upsert({
      where: {
        customerId_restaurantId: {
          customerId: customer.id,
          restaurantId: restaurantId,
        },
      },
      update: {}, // No updates needed during silent creation
      create: {
        customerId: customer.id,
        restaurantId: restaurantId,
        totalSpend: 0,
        totalOrders: 0,
        aov: 0,
        ltv: 0,
        firstVisit: new Date(),
        lastVisit: new Date(),
        visitFrequency: 0,
        repeatStatus: 'NEW',
        healthScore: 100,
        engagementScore: 5,
      },
    });

    return customer.id;
  }
}
