import 'dotenv/config';
import { prisma } from './src/lib/prisma';

async function checkActiveOrders() {
  const restaurant = await prisma.restaurant.findFirst({
    where: { name: { contains: 'Rooftree', mode: 'insensitive' } }
  });

  if (!restaurant) {
    console.log('Restaurant "The Rooftree" not found');
    await prisma.$disconnect();
    return;
  }

  console.log(`Restaurant: ${restaurant.name} (ID: ${restaurant.id})`);

  const tables = await prisma.restaurantTable.findMany({
    where: { restaurantId: restaurant.id }
  });
  console.log('\nTables:');
  for (const table of tables) {
    console.log(`- Table ${table.tableNumber} (ID: ${table.id})`);
  }

  const orders = await prisma.order.findMany({
    where: { restaurantId: restaurant.id },
    include: { table: true }
  });

  console.log('\nOrders:');
  for (const order of orders) {
    console.log(`- Order #${order.orderNumber} for Table ${order.table?.tableNumber || 'N/A'} - Status: ${order.status}, Total: ${order.totalAmount}`);
  }

  const notifications = await prisma.notification.findMany({
    where: { restaurantId: restaurant.id, type: 'BILLING', isRead: false }
  });

  console.log('\nUnread Billing Notifications:');
  for (const notif of notifications) {
    console.log(`- ID: ${notif.id}, Title: "${notif.title}", Message: "${notif.message}"`);
  }

  await prisma.$disconnect();
}

checkActiveOrders().catch(async (e) => {
  console.error(e);
  await prisma.$disconnect();
});
