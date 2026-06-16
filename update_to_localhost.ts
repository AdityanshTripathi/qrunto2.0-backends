import 'dotenv/config';
import { prisma } from './src/lib/prisma';

async function updateToLocalhost() {
  const LOCAL_BASE_URL = 'http://localhost:5173';
  console.log('Fetching all tables...');
  
  const tables = await prisma.restaurantTable.findMany();
  console.log(`Found ${tables.length} tables in total.`);

  let updatedCount = 0;

  for (const table of tables) {
    if (!table.qrCodeUrl) continue;

    let newUrl = table.qrCodeUrl;
    let needsUpdate = false;

    // We want to replace any production/vercel domains with http://localhost:5173
    // E.g., https://qrunto.vercel.app or https://frontend-ecru-beta-98.vercel.app
    if (newUrl.includes('qrunto.vercel.app')) {
      newUrl = newUrl.replace('https://qrunto.vercel.app', LOCAL_BASE_URL);
      needsUpdate = true;
    } else if (newUrl.includes('frontend-ecru-beta-98.vercel.app')) {
      newUrl = newUrl.replace('https://frontend-ecru-beta-98.vercel.app', LOCAL_BASE_URL);
      needsUpdate = true;
    } else if (newUrl.startsWith('http://') && !newUrl.startsWith(LOCAL_BASE_URL)) {
      // Just in case there's another http domain
      try {
        const urlObj = new URL(newUrl);
        newUrl = LOCAL_BASE_URL + urlObj.pathname + urlObj.search;
        needsUpdate = true;
      } catch (err) {
        console.error(`Invalid URL format: ${newUrl}`);
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

  console.log(`\nUpdated ${updatedCount} tables to localhost successfully.`);
  await prisma.$disconnect();
}

updateToLocalhost().catch(async (e) => {
  console.error('Error updating QR URLs to localhost:', e);
  await prisma.$disconnect();
});
