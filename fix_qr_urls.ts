import 'dotenv/config';
import { prisma } from './src/lib/prisma';

async function fixQrUrls() {
  const TARGET_HOST = 'https://www.ordio.in';

  console.log('Fetching all tables...');
  const tables = await prisma.restaurantTable.findMany();
  console.log(`Found ${tables.length} tables to process.`);

  let updatedCount = 0;

  for (const table of tables) {
    if (!table.qrCodeUrl) continue;

    const orderIdx = table.qrCodeUrl.indexOf('/order/');
    if (orderIdx !== -1) {
      const path = table.qrCodeUrl.substring(orderIdx);
      const newUrl = `${TARGET_HOST}${path}`;

      if (newUrl !== table.qrCodeUrl) {
        await prisma.restaurantTable.update({
          where: { id: table.id },
          data: { qrCodeUrl: newUrl }
        });
        console.log(`✅ Updated Table "${table.tableNumber}":`);
        console.log(`   Old: ${table.qrCodeUrl}`);
        console.log(`   New: ${newUrl}`);
        updatedCount++;
      }
    }
  }

  console.log(`\n✅ All done! Updated ${updatedCount} QR URLs successfully.`);
  await prisma.$disconnect();
}

fixQrUrls().catch(async (e) => {
  console.error('Error:', e);
  await prisma.$disconnect();
  process.exit(1);
});
