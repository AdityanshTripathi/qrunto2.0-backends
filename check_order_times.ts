import 'dotenv/config';
import { prisma } from './src/lib/prisma';

async function checkOrderTimes() {
  const orders = await prisma.order.findMany({
    orderBy: { createdAt: 'desc' },
    take: 15,
    include: {
      orderItems: true,
      table: true,
    }
  });

  console.log(`Found ${orders.length} orders:`);
  for (const order of orders) {
    console.log(`Order #${order.orderNumber} (ID: ${order.id})`);
    console.log(`  Table: ${order.table.tableNumber} | Status: ${order.status}`);
    console.log(`  Created At: ${order.createdAt.toISOString()}`);
    console.log(`  Items: ${order.orderItems.map(i => `${i.itemName} x${i.quantity}`).join(', ')}`);
  }

  await prisma.$disconnect();
}

checkOrderTimes().catch(async (e) => {
  console.error(e);
  await prisma.$disconnect();
});
