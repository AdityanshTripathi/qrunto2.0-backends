import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { Pool } from 'pg';
import 'dotenv/config';

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  throw new Error('DATABASE_URL is missing in environment variables');
}

const pool = new Pool({ connectionString });
const adapter = new PrismaPg(pool);
const prisma = new PrismaClient({ adapter });

async function main() {
  console.log('Seeding subscription plans...');

  const plans = [
    {
      name: 'Starter',
      price: 499.00,
      durationDays: 30,
      maxTables: 10,
      maxMenuItems: 50,
      featuresJson: [
        'Up to 10 Tables',
        'Up to 50 Menu Items',
        'Standard QR Ordering',
        'Online Payments (Razorpay)',
        'Basic Sales Analytics',
        'Email Support'
      ],
      isActive: true
    },
    {
      name: 'Professional',
      price: 999.00,
      durationDays: 30,
      maxTables: 30,
      maxMenuItems: 150,
      featuresJson: [
        'Up to 30 Tables',
        'Up to 150 Menu Items',
        'Custom Theme Settings',
        'Real-time Order Updates (Socket.io)',
        'Detailed Analytics & Reports',
        'Priority Email & Chat Support'
      ],
      isActive: true
    },
    {
      name: 'Enterprise',
      price: 1999.00,
      durationDays: 30,
      maxTables: 9999,
      maxMenuItems: 9999,
      featuresJson: [
        'Unlimited Tables',
        'Unlimited Menu Items',
        'Custom Branding & Theme',
        'Real-time Order Dashboard',
        'Advanced Analytics Insights',
        'Dedicated 24/7 Account Manager',
        'API Access for POS Integration'
      ],
      isActive: true
    }
  ];

  for (const plan of plans) {
    const existing = await prisma.subscriptionPlan.findFirst({
      where: { name: plan.name }
    });

    if (existing) {
      await prisma.subscriptionPlan.update({
        where: { id: existing.id },
        data: {
          price: plan.price,
          durationDays: plan.durationDays,
          maxTables: plan.maxTables,
          maxMenuItems: plan.maxMenuItems,
          featuresJson: plan.featuresJson,
          isActive: plan.isActive
        }
      });
      console.log(`Updated plan: ${plan.name}`);
    } else {
      await prisma.subscriptionPlan.create({
        data: plan
      });
      console.log(`Created plan: ${plan.name}`);
    }
  }

  console.log('Seeding completed successfully!');
}

main()
  .catch((e) => {
    console.error('Error during seeding:', e);
    process.exit(1);
  })
  .finally(async () => {
    await pool.end();
  });
