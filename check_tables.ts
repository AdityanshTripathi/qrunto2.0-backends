import 'dotenv/config';
import { prisma } from './src/lib/prisma';


async function checkTables() {
  console.log('Fetching all restaurant tables...');
  const tables = await prisma.restaurantTable.findMany({
    include: {
      restaurant: {
        select: {
          slug: true,
          name: true,
        }
      }
    }
  });

  console.log(`Found ${tables.length} tables:`);
  for (const table of tables) {
    console.log(`Restaurant: "${table.restaurant.name}" (slug: ${table.restaurant.slug}) | Table "${table.tableNumber}" | QR URL: ${table.qrCodeUrl}`);
  }

  await prisma.$disconnect();
}

checkTables().catch(async (e) => {
  console.error('Error:', e);
  await prisma.$disconnect();
});
