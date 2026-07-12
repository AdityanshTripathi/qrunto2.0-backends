/// <reference path="./types/express.d.ts" />
import 'dotenv/config'; // Loaded env variables
import express, { Request, Response } from 'express';
import cors from 'cors';
import authRouter from './routes/auth.routes';
import planRouter from './routes/plan.routes';
import subscriptionRouter from './routes/subscription.routes';
import categoryRouter from './routes/category.routes';
import menuItemRouter from './routes/menuItem.routes';
import tableRouter from './routes/table.routes';
import publicRouter from './routes/public.routes';
import orderRouter from './routes/order.routes';
import analyticsRouter from './routes/analytics.routes';
import settingsRouter from './routes/settings.routes';
import superadminRouter from './routes/superadmin.routes';
import notificationRouter from './routes/notification.routes';
import waiterRouter from './routes/waiter.routes';
import inventoryRouter from './routes/inventory.routes';
import customerRouter from './routes/crm/customer.routes';
import loyaltyRouter from './routes/crm/loyalty.routes';
import couponRouter from './routes/crm/coupon.routes';
import segmentRouter from './routes/crm/segment.routes';
import campaignRouter from './routes/crm/campaign.routes';
import feedbackRouter from './routes/crm/feedback.routes';
import aiGatewayRouter from './routes/crm/ai-gateway.routes';
import { CRMScheduler } from './services/crm/scheduler.service';
import http from 'http';
import { Server } from 'socket.io';


const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: '*',
    methods: ['GET', 'POST', 'PATCH', 'PUT', 'DELETE'],
  }
});

app.set('io', io);

io.on('connection', (socket) => {
  console.log('Socket client connected:', socket.id);
  
  socket.on('join_restaurant', (restaurantId) => {
    socket.join(restaurantId);
    console.log(`Socket client ${socket.id} joined room ${restaurantId}`);
  });

  socket.on('disconnect', () => {
    console.log('Socket client disconnected:', socket.id);
  });
});

const port = process.env.PORT || 5000;

app.use(cors());
app.use(express.json());

// Auth routes
app.use('/api/auth', authRouter);

// Plan routes
app.use('/api/plans', planRouter);

// Subscription routes
app.use('/api/subscriptions', subscriptionRouter);

// Category routes
app.use('/api/categories', categoryRouter);

// Menu Item routes
app.use('/api/menu-items', menuItemRouter);

// Table routes
app.use('/api/tables', tableRouter);

// Order routes
app.use('/api/orders', orderRouter);

// Analytics routes
app.use('/api/analytics', analyticsRouter);

// Settings routes
app.use('/api/settings', settingsRouter);

// Superadmin routes
app.use('/api/superadmin', superadminRouter);

// Notification routes
app.use('/api/notifications', notificationRouter);

// Waiter routes
app.use('/api/dashboard/waiters', waiterRouter);

// Inventory routes
app.use('/api/inventory', inventoryRouter);

// Customer CRM routes
app.use('/api/crm/customers', customerRouter);
app.use('/api/crm/loyalty', loyaltyRouter);
app.use('/api/crm/coupons', couponRouter);
app.use('/api/crm/segments', segmentRouter);
app.use('/api/crm/campaigns', campaignRouter);
app.use('/api/crm/feedback', feedbackRouter);
app.use('/api/crm/ai', aiGatewayRouter);

// Public customer-facing routes (no auth)
app.use('/api/public', publicRouter);

// Health check endpoint
app.get('/health', (req: Request, res: Response) => {
  res.status(200).json({ status: 'OK', message: 'OrderFlow API is running' });
});

if (!process.env.VERCEL) {
  server.listen(port, () => {
    console.log(`Server is running on port ${port}`);
    CRMScheduler.start();
  });
}

export default app;
