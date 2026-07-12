import 'dotenv/config';
import { prisma } from '../lib/prisma';

async function run() {
  console.log('Starting CRM Customer and Order backfill script...');
  try {
    // 1. Fetch all restaurants
    const restaurants = await prisma.restaurant.findMany({
      include: {
        orders: {
          orderBy: {
            createdAt: 'asc',
          },
        },
      },
    });

    console.log(`Found ${restaurants.length} restaurants to process.`);

    for (const restaurant of restaurants) {
      console.log(`Processing restaurant: ${restaurant.name} (${restaurant.id})...`);

      // 2. Ensure the restaurant is linked to a Brand
      let brandId = restaurant.brandId;
      if (!brandId) {
        // Create a brand for this restaurant if it doesn't have one
        const brandName = `${restaurant.name} Brand`;
        const newBrand = await prisma.brand.create({
          data: {
            name: brandName,
          },
        });
        brandId = newBrand.id;

        // Update restaurant to link it to the new brand
        await prisma.restaurant.update({
          where: { id: restaurant.id },
          data: { brandId: newBrand.id },
        });
        console.log(`Created new brand "${brandName}" and linked to restaurant.`);
      }

      // 3. Find all orders with customer phone numbers
      const ordersWithPhone = restaurant.orders.filter(
        (o) => o.customerPhone && o.customerPhone.trim() !== ''
      );

      if (ordersWithPhone.length === 0) {
        console.log(`No orders with phone numbers found for restaurant ${restaurant.name}.`);
        continue;
      }

      console.log(`Found ${ordersWithPhone.length} orders with phone numbers.`);

      // Group orders by phone number (standardizing whitespace)
      const ordersByPhone: { [phone: string]: typeof ordersWithPhone } = {};
      for (const order of ordersWithPhone) {
        const phone = order.customerPhone!.trim();
        if (!ordersByPhone[phone]) {
          ordersByPhone[phone] = [];
        }
        ordersByPhone[phone].push(order);
      }

      console.log(`Deduplicated into ${Object.keys(ordersByPhone).length} unique customers.`);

      // 4. Create/link customer profiles and recalculate metrics
      for (const [phone, customerOrders] of Object.entries(ordersByPhone)) {
        const latestOrder = customerOrders[customerOrders.length - 1];
        if (!latestOrder) continue;
        const name = latestOrder.customerName || 'Anonymous Customer';

        // Check if customer already exists for this brand
        let customer = await prisma.customer.findUnique({
          where: {
            brandId_phone: {
              brandId: brandId!,
              phone: phone,
            },
          },
        });

        if (!customer) {
          customer = await prisma.customer.create({
            data: {
              brandId: brandId!,
              phone: phone,
              name: name,
              acquisitionSource: 'QR_ORDER',
            },
          });
          console.log(`Created new Customer: ${name} (${phone})`);
        } else {
          // If name is Anonymous but we have a better name now, update it
          if (customer.name === 'Anonymous Customer' && name !== 'Anonymous Customer') {
            customer = await prisma.customer.update({
              where: { id: customer.id },
              data: { name: name },
            });
          }
          console.log(`Found existing Customer: ${customer.name} (${phone})`);
        }

        // Calculate outlet-specific metrics
        const totalOrders = customerOrders.length;
        const totalSpend = customerOrders.reduce((sum, o) => sum + o.totalAmount, 0);
        const aov = totalOrders > 0 ? totalSpend / totalOrders : 0;
        const firstOrder = customerOrders[0];
        const firstVisit = firstOrder ? firstOrder.createdAt : new Date();
        const lastVisit = latestOrder.createdAt;
        
        let visitFrequency = 0;
        if (totalOrders > 1) {
          const durationDays = (lastVisit.getTime() - firstVisit.getTime()) / (1000 * 60 * 60 * 24);
          visitFrequency = durationDays / (totalOrders - 1);
        }

        const repeatStatus = totalOrders > 1 ? 'REPEAT' : 'NEW';

        // Upsert Customer Restaurant Profile
        await prisma.customerRestaurantProfile.upsert({
          where: {
            customerId_restaurantId: {
              customerId: customer.id,
              restaurantId: restaurant.id,
            },
          },
          update: {
            totalSpend,
            totalOrders,
            aov,
            ltv: totalSpend,
            firstVisit,
            lastVisit,
            visitFrequency,
            repeatStatus,
          },
          create: {
            customerId: customer.id,
            restaurantId: restaurant.id,
            totalSpend,
            totalOrders,
            aov,
            ltv: totalSpend,
            firstVisit,
            lastVisit,
            visitFrequency,
            repeatStatus,
            healthScore: 100,
            engagementScore: Math.min(100, totalOrders * 5),
          },
        });

        // 5. Update order references to link this customer
        const orderIds = customerOrders.map((o) => o.id);
        await prisma.order.updateMany({
          where: {
            id: {
              in: orderIds,
            },
          },
          data: {
            customerId: customer.id,
          },
        });
        console.log(`Linked ${orderIds.length} orders to Customer ${customer.name}.`);
      }
    }

    console.log('CRM backfill migration completed successfully.');
  } catch (error: any) {
    console.error('Migration failed:', error.stack || error.message);
  } finally {
    await prisma.$disconnect();
    process.exit(0);
  }
}

run();
