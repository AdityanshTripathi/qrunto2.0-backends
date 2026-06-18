import 'dotenv/config';
import { prisma } from './src/lib/prisma';

async function checkOrders() {
  console.log('Fetching last 10 orders...');
  const orders = await prisma.order.findMany({
    orderBy: { createdAt: 'desc' },
    take: 10,
    include: {
      orderItems: true,
      table: true,
      restaurant: true,
    }
  });

  console.log(`Found ${orders.length} orders:`);
  for (const order of orders) {
    console.log(`Order #${order.orderNumber} (ID: ${order.id}) | Table: ${order.table.tableNumber} | Restaurant: ${order.restaurant.name}`);
    console.log(`  Status: ${order.status} | Total Amount: ₹${order.totalAmount}`);
    console.log(`  Items:`);
    for (const item of order.orderItems) {
      console.log(`    - ${item.itemName} x${item.quantity} (₹${item.totalPrice})`);
    }
  }

  await prisma.$disconnect();
}

checkOrders().catch(async (e) => {
  console.error('Error:', e);
  await prisma.$disconnect();
});
