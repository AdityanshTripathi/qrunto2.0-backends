import { prisma } from '../../lib/prisma';

export type TimelineEventType = 'ORDER' | 'NOTE' | 'REGISTRATION' | 'LOYALTY';

export interface TimelineEvent {
  id: string;
  type: TimelineEventType;
  title: string;
  description: string;
  timestamp: Date;
  metadata?: any;
}

export class TimelineService {
  async getCustomerTimeline(customerId: string, brandId: string): Promise<TimelineEvent[]> {
    // 1. Verify customer belongs to the brand
    const customer = await prisma.customer.findFirst({
      where: { id: customerId, brandId },
    });

    if (!customer) {
      throw new Error('Customer not found or unauthorized');
    }

    const events: TimelineEvent[] = [];

    // 2. Fetch Orders
    const orders = await prisma.order.findMany({
      where: { customerId },
      include: {
        orderItems: true,
        table: true,
      },
      orderBy: { createdAt: 'desc' },
    });

    for (const order of orders) {
      events.push({
        id: `order-${order.id}`,
        type: 'ORDER',
        title: `Order #${order.orderNumber}`,
        description: `Total: ₹${order.totalAmount.toLocaleString('en-IN')} (${order.status})`,
        timestamp: order.createdAt,
        metadata: {
          orderId: order.id,
          status: order.status,
          total: order.totalAmount,
          items: order.orderItems.map((item) => ({
            name: item.itemName,
            quantity: item.quantity,
            price: item.unitPrice,
          })),
          tableNumber: order.table?.tableNumber,
          notes: order.notes,
        },
      });
    }

    // 3. Fetch Notes
    const notes = await prisma.customerNote.findMany({
      where: { customerId },
      include: {
        user: {
          select: { name: true },
        },
      },
      orderBy: { createdAt: 'desc' },
    });

    for (const note of notes) {
      events.push({
        id: `note-${note.id}`,
        type: 'NOTE',
        title: note.isSystem ? 'System Note' : `Note by ${note.user.name}`,
        description: note.noteText,
        timestamp: note.createdAt,
        metadata: {
          noteId: note.id,
          isSystem: note.isSystem,
          userName: note.user.name,
        },
      });
    }

    // 4. Fetch Loyalty Ledger Logs
    const loyaltyAccount = await prisma.loyaltyAccount.findUnique({
      where: { customerId },
    });

    if (loyaltyAccount) {
      const ledgers = await prisma.loyaltyLedger.findMany({
        where: { loyaltyAccountId: loyaltyAccount.id },
        orderBy: { createdAt: 'desc' },
      });

      for (const ledger of ledgers) {
        events.push({
          id: `loyalty-${ledger.id}`,
          type: 'LOYALTY',
          title: `Loyalty Points (${ledger.transactionType})`,
          description: `${ledger.points > 0 ? '+' : ''}${ledger.points} Points: ${ledger.description}`,
          timestamp: ledger.createdAt,
          metadata: {
            ledgerId: ledger.id,
            points: ledger.points,
            type: ledger.transactionType,
            orderId: ledger.orderId,
          },
        });
      }
    }

    // 5. Add Registration Event
    events.push({
      id: `reg-${customer.id}`,
      type: 'REGISTRATION',
      title: 'Customer Registered',
      description: `Acquired via ${customer.acquisitionSource.replace('_', ' ')}`,
      timestamp: customer.createdAt,
      metadata: {
        acquisitionSource: customer.acquisitionSource,
      },
    });

    // 6. Sort all events chronologically descending (newest first)
    return events.sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime());
  }
}
