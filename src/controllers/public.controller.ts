import { Request, Response } from 'express';
import { z } from 'zod';
import { prisma } from '../lib/prisma';
import { ProfilerService } from '../services/crm/profiler.service';
import { LoyaltyService } from '../services/crm/loyalty.service';
import { CouponService } from '../services/crm/coupon.service';
import { ReferralService } from '../services/crm/referral.service';

const referralService = new ReferralService();

// ─── Zod Schema ───────────────────────────────────────────────────────────────
const PlaceOrderSchema = z.object({
  tableNumber: z.string().min(1, 'Table number is required'),
  items: z
    .array(
      z.object({
        menuItemId: z.string().uuid('Invalid menu item ID'),
        quantity: z.number().int().min(1, 'Quantity must be at least 1'),
      })
    )
    .min(1, 'At least one item is required'),
  notes: z.string().max(500).optional(),
  customerName: z.string().max(100).optional(),
  customerPhone: z.string().max(15).optional(),
  existingOrderId: z.string().uuid('Invalid order ID').optional(),
  redeemPoints: z.number().int().nonnegative().optional(),
  couponCode: z.string().optional(),
});

const AssistanceRequestSchema = z.object({
  type: z.enum(['WAITER', 'BILL']),
});

// ─── Helper: generate order number ────────────────────────────────────────────
function generateOrderNumber(): string {
  const now = new Date();
  const date = now.toISOString().slice(0, 10).replace(/-/g, '');
  const rand = Math.floor(1000 + Math.random() * 9000);
  return `ORD-${date}-${rand}`;
}

export class PublicController {
  // ─── GET /api/public/:slug ─────────────────────────────────────────────────
  // Returns restaurant info, active categories, and available menu items.
  // No authentication required — this is the public customer-facing endpoint.
  async getRestaurantMenu(req: Request, res: Response): Promise<void> {
    try {
      const slug = req.params['slug'] as string;
      if (!slug) {
        res.status(400).json({ error: 'Restaurant slug is required' });
        return;
      }

      // 1. Fetch restaurant by slug
      const restaurant = await prisma.restaurant.findUnique({
        where: { slug },
        include: {
          settings: true,
        },
      });

      if (!restaurant || !restaurant.isActive) {
        res.status(404).json({ error: 'Restaurant not found or is currently unavailable' });
        return;
      }

      // 2. Fetch active categories ordered by displayOrder
      const categories = await prisma.category.findMany({
        where: { restaurantId: restaurant.id, isActive: true },
        orderBy: { displayOrder: 'asc' },
      });

      // 3. Fetch available menu items with their category
      const menuItems = await prisma.menuItem.findMany({
        where: { restaurantId: restaurant.id, isAvailable: true },
        include: { category: true },
        orderBy: { name: 'asc' },
      });

      res.status(200).json({
        restaurant: {
          id: restaurant.id,
          name: restaurant.name,
          slug: restaurant.slug,
          logoUrl: restaurant.logoUrl,
        },
        settings: {
          currency: restaurant.settings?.currency ?? 'INR',
          taxPercentage: restaurant.settings?.taxPercentage ?? 0,
        },
        categories,
        menuItems,
      });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  }

  // ─── POST /api/public/:slug/orders ────────────────────────────────────────
  // Places an order for a table. Prices are fetched from DB — never trusted from client.
  async placeOrder(req: Request, res: Response): Promise<void> {
    try {
      const slug = req.params['slug'] as string;
      if (!slug) {
        res.status(400).json({ error: 'Restaurant slug is required' });
        return;
      }

      // 1. Validate input
      const validationResult = PlaceOrderSchema.safeParse(req.body);
      if (!validationResult.success) {
        res.status(400).json({ errors: validationResult.error.flatten().fieldErrors });
        return;
      }
      const { tableNumber, items, notes, customerName, customerPhone, existingOrderId, redeemPoints, couponCode } = validationResult.data;

      // 2. Fetch restaurant
      const restaurant = await prisma.restaurant.findUnique({
        where: { slug },
        include: { settings: true },
      });
      if (!restaurant || !restaurant.isActive) {
        res.status(404).json({ error: 'Restaurant not found or is unavailable' });
        return;
      }

      // 3. Find the table
      const table = await prisma.restaurantTable.findFirst({
        where: { restaurantId: restaurant.id, tableNumber, isActive: true },
      });
      if (!table) {
        res.status(404).json({ error: `Table "${tableNumber}" not found or is inactive` });
        return;
      }

      // Check for existing order
      let existingOrder = null;
      if (existingOrderId) {
        existingOrder = await prisma.order.findUnique({
          where: { id: existingOrderId },
          include: { orderItems: true },
        });
        if (!existingOrder) {
          res.status(404).json({ error: 'Active order not found' });
          return;
        }
        if (existingOrder.status === 'CANCELLED') {
          res.status(400).json({ error: 'Cannot add items to a cancelled order' });
          return;
        }
        // Check if there is already a successful payment for this order
        const successfulPayment = await prisma.payment.findFirst({
          where: { orderId: existingOrderId, status: 'SUCCESS' },
        });
        if (successfulPayment) {
          res.status(400).json({ error: 'Cannot add items to an already paid order' });
          return;
        }
      }

      // 4. Fetch and validate all menu items from DB (never trust client prices)
      const menuItemIds = items.map((i) => i.menuItemId);
      const dbMenuItems = await prisma.menuItem.findMany({
        where: {
          id: { in: menuItemIds },
          restaurantId: restaurant.id,
          isAvailable: true,
        },
      });

      if (dbMenuItems.length !== menuItemIds.length) {
        const foundIds = new Set(dbMenuItems.map((m) => m.id));
        const missingIds = menuItemIds.filter((id) => !foundIds.has(id));
        res.status(400).json({
          error: `Some menu items are unavailable or not found: ${missingIds.join(', ')}`,
        });
        return;
      }

      // 5. Calculate totals
      const taxPercentage = restaurant.settings?.taxPercentage ?? 0;
      let newSubtotal = 0;
      const orderItemsData: {
        menuItemId: string;
        itemName: string;
        quantity: number;
        unitPrice: number;
        totalPrice: number;
      }[] = [];

      for (const reqItem of items) {
        const dbItem = dbMenuItems.find((m) => m.id === reqItem.menuItemId)!;
        const itemTotal = dbItem.price * reqItem.quantity;
        newSubtotal += itemTotal;
        orderItemsData.push({
          menuItemId: dbItem.id,
          itemName: dbItem.name,
          quantity: reqItem.quantity,
          unitPrice: dbItem.price,
          totalPrice: itemTotal,
        });
      }

      const newTaxAmount = parseFloat(((newSubtotal * taxPercentage) / 100).toFixed(2));
      const newTotalAmount = parseFloat((newSubtotal + newTaxAmount).toFixed(2));

      // Link customer profile if phone is provided
      let customerId: string | undefined = undefined;
      if (customerPhone && customerPhone.trim() !== '') {
        const profilerService = new ProfilerService();
        try {
          customerId = await profilerService.linkOrCreateCustomer(
            restaurant.id,
            customerPhone,
            customerName || 'Anonymous Customer'
          );
        } catch (crmErr) {
          console.error('Failed to link customer in CRM:', crmErr);
        }
      }

      // 6. Create or update order in a transaction
      const order = await prisma.$transaction(async (tx) => {
        if (existingOrder) {
          // Append new order items
          await tx.orderItem.createMany({
            data: orderItemsData.map((item) => ({
              orderId: existingOrder.id,
              menuItemId: item.menuItemId,
              itemName: item.itemName,
              quantity: item.quantity,
              unitPrice: item.unitPrice,
              totalPrice: item.totalPrice,
            })),
          });

          // Update order totals
          const updatedSubtotal = parseFloat((existingOrder.subtotal + newSubtotal).toFixed(2));
          const updatedTaxAmount = parseFloat((existingOrder.taxAmount + newTaxAmount).toFixed(2));
          const updatedTotalAmount = parseFloat((existingOrder.totalAmount + newTotalAmount).toFixed(2));

          const updatedOrder = await tx.order.update({
            where: { id: existingOrder.id },
            data: {
              subtotal: updatedSubtotal,
              taxAmount: updatedTaxAmount,
              totalAmount: updatedTotalAmount,
              status: existingOrder.status === 'NEW' ? 'NEW' : 'PREPARING',
              ...(!(existingOrder as any).customerId && customerId ? { customerId } : {}),
              ...(!existingOrder.customerName && customerName ? { customerName } : {}),
              ...(!existingOrder.customerPhone && customerPhone ? { customerPhone } : {}),
            },
            include: {
              orderItems: true,
              table: true,
            },
          });

          // Create notification for additional items
          await tx.notification.create({
            data: {
              restaurantId: restaurant.id,
              title: `Added Items to Order #${existingOrder.orderNumber}`,
              message: `Table ${tableNumber} added ${orderItemsData.length} new item(s) to Order #${existingOrder.orderNumber}. New Total: ₹${updatedTotalAmount.toLocaleString('en-IN')}`,
              type: 'NEW_ORDER',
            },
          });

          return updatedOrder;
        } else {
          let orderNumber = generateOrderNumber();
          let attempts = 0;
          while (attempts < 5) {
            const existing = await tx.order.findFirst({
              where: { restaurantId: restaurant.id, orderNumber },
            });
            if (!existing) break;
            orderNumber = generateOrderNumber();
            attempts++;
          }

          // Points redemption discount calculation (1 point = ₹1)
          let pointsDiscount = 0;
          if (redeemPoints && redeemPoints > 0 && customerId) {
            const account = await tx.loyaltyAccount.findUnique({
              where: { customerId }
            });
            if (!account || account.pointsBalance < redeemPoints) {
              throw new Error(`Insufficient points balance. Available: ${account?.pointsBalance || 0}, Requested: ${redeemPoints}`);
            }
            pointsDiscount = Math.min(newTotalAmount, redeemPoints);
          }

          let remainingAmount = Math.max(0, newTotalAmount - pointsDiscount);

          let couponDiscount = 0;
          if (couponCode && couponCode.trim() !== '' && customerId) {
            const couponService = new CouponService();
            const validation = await couponService.validateAndRedeem(customerId, couponCode, remainingAmount, 'TEMP_ORDER_ID', tx);
            couponDiscount = validation.discountAmount;
          }

          const finalTotalAmount = parseFloat((remainingAmount - couponDiscount).toFixed(2));
          
          let orderNotes = notes || '';
          if (pointsDiscount > 0) {
            orderNotes = `${orderNotes} [Redeemed ${redeemPoints} points, ₹${pointsDiscount} discount]`.trim();
          }
          if (couponDiscount > 0) {
            orderNotes = `${orderNotes} [Coupon ${couponCode}: ₹${couponDiscount} discount]`.trim();
          }

          const newOrder = await tx.order.create({
            data: {
              restaurantId: restaurant.id,
              tableId: table.id,
              orderNumber,
              status: 'NEW',
              subtotal: newSubtotal,
              taxAmount: newTaxAmount,
              totalAmount: finalTotalAmount,
              ...(orderNotes ? { notes: orderNotes } : {}),
              ...(customerName ? { customerName } : {}),
              ...(customerPhone ? { customerPhone } : {}),
              ...(customerId ? { customerId } : {}),
              orderItems: {
                create: orderItemsData,
              },
            },
            include: {
              orderItems: true,
              table: true,
            },
          });

          // Process the points redemption in ledger
          if (pointsDiscount > 0 && customerId) {
            const loyaltyService = new LoyaltyService();
            await loyaltyService.redeemPoints(customerId, redeemPoints!, newOrder.id, tx);
          }

          // Link the coupon redemption to the created order id
          if (couponDiscount > 0 && couponCode && customerId) {
            const couponTemplate = await tx.coupon.findFirst({
              where: { code: { equals: couponCode, mode: 'insensitive' } }
            });
            if (couponTemplate) {
              await tx.customerCoupon.updateMany({
                where: { customerId, couponId: couponTemplate.id, orderId: 'TEMP_ORDER_ID' },
                data: { orderId: newOrder.id }
              });
            }
          }

          await tx.notification.create({
            data: {
              restaurantId: restaurant.id,
              title: `New Order #${orderNumber}`,
              message: `Table ${tableNumber} placed a new order for ${orderItemsData.length} items. Total: ₹${finalTotalAmount.toLocaleString('en-IN')}`,
              type: 'NEW_ORDER',
            },
          });

          return newOrder;
        }
      });

      const io = req.app.get('io');
      if (io) {
        const eventName = existingOrderId ? 'ITEM_ADDED' : 'NEW_ORDER';
        io.to(restaurant.id).emit(eventName, {
          orderId: order.id,
          orderNumber: order.orderNumber,
          tableNumber: order.table?.tableNumber,
          totalAmount: order.totalAmount,
          itemCount: order.orderItems.length,
          createdAt: order.createdAt,
        });
      }

      res.status(201).json({
        message: existingOrderId ? 'Items added successfully!' : 'Order placed successfully!',
        order: {
          id: order.id,
          orderNumber: order.orderNumber,
          status: order.status,
          subtotal: order.subtotal,
          taxAmount: order.taxAmount,
          totalAmount: order.totalAmount,
          tableNumber: order.table?.tableNumber,
          itemCount: order.orderItems.length,
          createdAt: order.createdAt,
          customerName: order.customerName,
          customerPhone: order.customerPhone,
        },
      });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  }

  // ─── GET /api/public/:slug/orders/:orderId/status ─────────────────────────
  async getOrderStatus(req: Request, res: Response): Promise<void> {
    try {
      const slug = req.params['slug'] as string;
      const orderId = req.params['orderId'] as string;
      if (!slug || !orderId) {
        res.status(400).json({ error: 'Restaurant slug and order ID are required' });
        return;
      }

      // Fetch restaurant
      const restaurant = await prisma.restaurant.findUnique({
        where: { slug },
      });
      if (!restaurant) {
        res.status(404).json({ error: 'Restaurant not found' });
        return;
      }

      // Fetch order details
      const order = (await prisma.order.findFirst({
        where: {
          id: orderId,
          restaurantId: restaurant.id,
        },
        include: {
          orderItems: true,
          table: true,
          payments: {
            orderBy: { createdAt: 'desc' },
            take: 1,
          },
        },
      })) as any;

      if (!order) {
        res.status(404).json({ error: 'Order not found' });
        return;
      }

      res.status(200).json({
        order: {
          id: order.id,
          orderNumber: order.orderNumber,
          status: order.status,
          subtotal: order.subtotal,
          taxAmount: order.taxAmount,
          totalAmount: order.totalAmount,
          tableNumber: order.table.tableNumber,
          notes: order.notes,
          customerName: order.customerName,
          customerPhone: order.customerPhone,
          createdAt: order.createdAt,
          items: order.orderItems.map((item: any) => ({
            id: item.id,
            name: item.itemName,
            quantity: item.quantity,
            unitPrice: item.unitPrice,
            totalPrice: item.totalPrice,
          })),
          paymentStatus: order.payments[0]?.status ?? 'PENDING',
          paymentMethod: order.payments[0]?.paymentMethod ?? null,
        },
      });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  }

  // ─── POST /api/public/:slug/orders/:orderId/pay-mock ────────────────────────
  async markOrderPaidMock(req: Request, res: Response): Promise<void> {
    try {
      const slug = req.params['slug'] as string;
      const orderId = req.params['orderId'] as string;
      const { paymentMethod } = req.body; // e.g., 'UPI', 'CARD'

      if (!slug || !orderId) {
        res.status(400).json({ error: 'Restaurant slug and order ID are required' });
        return;
      }

      // Fetch restaurant
      const restaurant = await prisma.restaurant.findUnique({
        where: { slug },
      });
      if (!restaurant) {
        res.status(404).json({ error: 'Restaurant not found' });
        return;
      }

      // Fetch order
      const order = await prisma.order.findFirst({
        where: {
          id: orderId,
          restaurantId: restaurant.id,
        },
      });

      if (!order) {
        res.status(404).json({ error: 'Order not found' });
        return;
      }

      // Create Payment and Transaction inside a database transaction
      const payment = await prisma.$transaction(async (tx) => {
        // Create Payment record
        const newPayment = await tx.payment.create({
          data: {
            restaurantId: restaurant.id,
            orderId: order.id,
            amount: order.totalAmount,
            status: 'SUCCESS',
            paymentMethod: paymentMethod || 'ONLINE_DEMO',
            razorpayOrderId: `order_mock_${Math.random().toString(36).substring(2, 11)}`,
            razorpayPaymentId: `pay_mock_${Math.random().toString(36).substring(2, 11)}`,
            paidAt: new Date(),
          },
        });

        // Create Transaction record
        await tx.transaction.create({
          data: {
            restaurantId: restaurant.id,
            paymentId: newPayment.id,
            amount: order.totalAmount,
            transactionType: 'INCOME',
            reference: `Razorpay Demo Ref: ${newPayment.razorpayPaymentId}`,
          },
        });

        // Update Order status to PAID
        await tx.order.update({
          where: { id: order.id },
          data: { status: 'PAID' },
        });

        // Earn loyalty points
        if (order.customerId && restaurant.brandId) {
          const loyaltyService = new LoyaltyService();
          await loyaltyService.earnPoints(order.customerId, restaurant.brandId, order.totalAmount, order.id, tx);
        }

        return newPayment;
      });

      res.status(200).json({
        message: 'Payment mock successful!',
        payment: {
          id: payment.id,
          amount: payment.amount,
          status: payment.status,
          paymentMethod: payment.paymentMethod,
          paidAt: payment.paidAt,
        },
      });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  }

  async requestAssistance(req: Request, res: Response): Promise<void> {
    try {
      const slug = req.params['slug'] as string;
      const tableNumber = req.params['tableNumber'] as string;

      if (!slug || !tableNumber) {
        res.status(400).json({ error: 'Restaurant slug and table number are required' });
        return;
      }

      // 1. Validate input
      const validationResult = AssistanceRequestSchema.safeParse(req.body);
      if (!validationResult.success) {
        res.status(400).json({ errors: validationResult.error.flatten().fieldErrors });
        return;
      }
      const { type } = validationResult.data;

      // 2. Fetch restaurant
      const restaurant = await prisma.restaurant.findUnique({
        where: { slug },
      });
      if (!restaurant || !restaurant.isActive) {
        res.status(404).json({ error: 'Restaurant not found or is inactive' });
        return;
      }

      // 3. Find the table
      const table = await prisma.restaurantTable.findFirst({
        where: { restaurantId: restaurant.id, tableNumber, isActive: true },
      });
      if (!table) {
        res.status(404).json({ error: `Table "${tableNumber}" not found or is inactive` });
        return;
      }

      // 4. Create notification based on request type
      const isWaiter = type === 'WAITER';
      const title = isWaiter ? `Table ${tableNumber} Request` : `Table ${tableNumber} Bill Request`;
      const message = isWaiter
        ? `Customer at Table ${tableNumber} is requesting waiter assistance.`
        : `Customer at Table ${tableNumber} is requesting the final bill.`;

      await prisma.notification.create({
        data: {
          restaurantId: restaurant.id,
          title,
          message,
          type: isWaiter ? 'HELP_REQUEST' : 'BILLING',
        },
      });

      const io = req.app.get('io');
      if (io) {
        const eventName = type === 'WAITER' ? 'CALL_WAITER' : 'REQUEST_BILL';
        io.to(restaurant.id).emit(eventName, {
          tableNumber,
          type,
          title,
          message,
          createdAt: new Date(),
        });
      }

      res.status(200).json({
        message: `${type === 'WAITER' ? 'Waiter call' : 'Bill request'} sent successfully!`,
      });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  }

  // Fetch loyalty points balance for a phone number (public)
  async getLoyaltyBalance(req: Request, res: Response): Promise<void> {
    try {
      const slug = req.params['slug'] as string;
      const phone = req.query['phone'] as string;

      if (!slug || !phone || phone.trim() === '') {
        res.status(200).json({ pointsBalance: 0, tierName: null });
        return;
      }

      // Find restaurant & brand
      const restaurant = await prisma.restaurant.findUnique({
        where: { slug },
        select: { id: true, brandId: true }
      });

      if (!restaurant || !restaurant.brandId) {
        res.status(404).json({ error: 'Restaurant or brand context not found' });
        return;
      }

      // Find customer
      const customer = await prisma.customer.findFirst({
        where: { phone, brandId: restaurant.brandId },
        include: {
          loyaltyAccount: true,
          profiles: {
            where: { restaurantId: restaurant.id },
            include: { loyaltyTier: true }
          }
        }
      });

      if (!customer) {
        res.status(200).json({ pointsBalance: 0, tierName: null });
        return;
      }

      const pointsBalance = customer.loyaltyAccount?.pointsBalance || 0;
      const tierName = customer.profiles?.[0]?.loyaltyTier?.name || null;

      res.status(200).json({ pointsBalance, tierName });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  }

  // Claim referral invite code (public guest action)
  async claimReferral(req: Request, res: Response): Promise<void> {
    try {
      const slug = req.params['slug'] as string;
      const { phone, referralCode } = req.body;

      if (!slug || !phone || !referralCode) {
        res.status(400).json({ error: 'Missing required parameters' });
        return;
      }

      const restaurant = await prisma.restaurant.findUnique({
        where: { slug },
        select: { id: true, brandId: true }
      });

      if (!restaurant || !restaurant.brandId) {
        res.status(404).json({ error: 'Restaurant or brand context not found' });
        return;
      }

      const result = await referralService.claimReferral(restaurant.brandId, phone, referralCode);
      res.status(200).json(result);
    } catch (err: any) {
      res.status(400).json({ error: err.message });
    }
  }
}

