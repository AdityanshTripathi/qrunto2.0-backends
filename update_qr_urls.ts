import 'dotenv/config';
import { prisma } from './src/lib/prisma';

async function updateQrUrls() {
  const TARGET_URL = 'https://qrunto.vercel.app';
  console.log('Fetching all tables...');
  
  const tables = await prisma.restaurantTable.findMany();
  console.log(`Found ${tables.length} tables in total.`);

  let updatedCount = 0;

  for (const table of tables) {
    if (!table.qrCodeUrl) continue;

    let newUrl = table.qrCodeUrl;
    let needsUpdate = false;

    // Check if URL contains old frontend Vercel domain
    if (newUrl.includes('frontend-ecru-beta-98.vercel.app')) {
      newUrl = newUrl.replace('frontend-ecru-beta-98.vercel.app', 'qrunto.vercel.app');
      needsUpdate = true;
    }
    // Check if URL contains localhost:5173
    else if (newUrl.includes('localhost:5173')) {
      newUrl = newUrl.replace('http://localhost:5173', 'https://qrunto.vercel.app');
      needsUpdate = true;
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
