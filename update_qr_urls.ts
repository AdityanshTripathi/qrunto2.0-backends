import 'dotenv/config';
import { prisma } from './src/lib/prisma';

async function updateQrUrls() {
  const TARGET_URL = 'https://ordio.in';
  console.log('Fetching all tables...');
  
  const tables = await prisma.restaurantTable.findMany();
  console.log(`Found ${tables.length} tables in total.`);

  let updatedCount = 0;

  for (const table of tables) {
    if (!table.qrCodeUrl) continue;

    let newUrl = table.qrCodeUrl;
    let needsUpdate = false;

    if (newUrl.startsWith('http://') || newUrl.startsWith('https://')) {
      try {
        const urlObj = new URL(newUrl);
        if (urlObj.host !== 'ordio.in') {
          newUrl = TARGET_URL + urlObj.pathname + urlObj.search;
          needsUpdate = true;
        }
      } catch (err) {
        console.error(`Invalid URL: ${newUrl}`);
      }
    }

    if (needsUpdate) {
      await prisma.restaurantTable.update({
        where: { id: table.id },
        data: { qrCodeUrl: newUrl }
      });
      console.log(`✅ Updated table ID ${table.id} (Table: "${table.tableNumber}"):`);
      console.log(`   Old: ${table.qrCodeUrl}`);
      console.log(`   New: ${newUrl}`);
      updatedCount++;
    }
  }

  console.log(`\nUpdated ${updatedCount} tables successfully.`);
  await prisma.$disconnect();
}

updateQrUrls().catch(async (e) => {
  console.error('Error updating QR URLs:', e);
  await prisma.$disconnect();
});
