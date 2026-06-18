import 'dotenv/config';
import { prisma } from './src/lib/prisma';

const BASE_URL = 'http://localhost:5000/api';

async function testApiFlow() {
  const slug = 'chikenchilly';
  const tableNumber = '12';

  // 1. Find a menu item to order
  const menuItem = await prisma.menuItem.findFirst({
    where: { restaurant: { slug }, isAvailable: true }
  });
  if (!menuItem) {
    console.error('No menu item found for restaurant!');
    return;
  }
  console.log(`Using Menu Item: "${menuItem.name}" (ID: ${menuItem.id})`);

  // 2. Place first order (initial placement)
  console.log('\nPlacing first order...');
  let res = await fetch(`${BASE_URL}/public/${slug}/orders`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      tableNumber,
      items: [{ menuItemId: menuItem.id, quantity: 1 }]
    })
  });
  let data = await res.json() as any;
  if (!res.ok) {
    console.error('First order failed:', data);
    return;
  }
  const order1 = data.order;
  console.log(`Order 1 Placed successfully! Order Number: ${order1.orderNumber}, ID: ${order1.id}`);

  // 3. Place second order (appending to first order)
  console.log('\nPlacing second order (appending)...');
  res = await fetch(`${BASE_URL}/public/${slug}/orders`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      tableNumber,
      items: [{ menuItemId: menuItem.id, quantity: 1 }],
      existingOrderId: order1.id
    })
  });
  data = await res.json() as any;
  if (!res.ok) {
    console.error('Second order failed:', data);
    return;
  }
  const order2 = data.order;
  console.log(`Order 2 Placed successfully! Order Number: ${order2.orderNumber}, ID: ${order2.id}`);

  // 4. Verify in database
  console.log('\nVerifying database state...');
  const dbOrder = await prisma.order.findUnique({
    where: { id: order1.id },
    include: { orderItems: true }
  });
  if (dbOrder) {
    console.log(`Database Order ID: ${dbOrder.id}`);
    console.log(`Order Number in DB: ${dbOrder.orderNumber}`);
    console.log(`Total Amount: ₹${dbOrder.totalAmount}`);
    console.log(`Order Items Count: ${dbOrder.orderItems.length}`);
    for (const item of dbOrder.orderItems) {
      console.log(`  - ${item.itemName} x${item.quantity}`);
    }
  }

  // 5. Clean up tests (delete this test order so we don't mess up real data)
  await prisma.order.delete({ where: { id: order1.id } });
  console.log('\nTest order cleaned up successfully.');

  await prisma.$disconnect();
}

testApiFlow().catch(async (e) => {
  console.error('Test script crashed:', e);
  await prisma.$disconnect();
});
