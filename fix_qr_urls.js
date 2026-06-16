const { PrismaClient } = require('./node_modules/@prisma/client');
require('dotenv').config();

const prisma = new PrismaClient();

async function fixQrUrls() {
  const OLD_URL = 'http://localhost:5173';
  const NEW_URL = 'https://frontend-ecru-beta-98.vercel.app';

  console.log('Fetching all tables with localhost QR URLs...');
  
  const tables = await prisma.restaurantTable.findMany({
    where: {
      qrCodeUrl: {
        startsWith: OLD_URL
      }
    }
  });

  console.log(`Found ${tables.length} tables to update.`);

  for (const table of tables) {
    const newUrl = table.qrCodeUrl.replace(OLD_URL, NEW_URL);
    await prisma.restaurantTable.update({
      where: { id: table.id },
      data: { qrCodeUrl: newUrl }
    });
    console.log(`Updated Table "${table.tableNumber}": ${newUrl}`);
  }

  console.log('\nAll done! QR URLs updated successfully.');
  await prisma.$disconnect();
}

fixQrUrls().catch(async (e) => {
  console.error('Error:', e);
  await prisma.$disconnect();
  process.exit(1);
});
