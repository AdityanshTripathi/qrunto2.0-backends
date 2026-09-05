/// <reference path="./types/express.d.ts" />
import 'dotenv/config'; // Loaded env variables
import express, { Request, Response } from 'express';
import cors from 'cors';
import helmet from 'helmet';
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
import whatsappRouter from './routes/whatsapp.routes';
import { CRMScheduler } from './services/crm/scheduler.service';
import cronRouter from './routes/crm/cron.routes';
import http from 'http';
import { Server } from 'socket.io';
import { redisUrl, sharedRedis } from './lib/redis';
import { resolveAccessToken } from './middlewares/auth.middleware';
import { corsOptions } from './config/cors';


const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: corsOptions,
  path: '/socket.io',
});

app.set('io', io);

const requiresSharedSocketState = process.env.VERCEL === '1' && process.env.NODE_ENV === 'production';

export const realtimeReady = sharedRedis.initializeAdapter(io);
// Observe startup failures even before the first request; subsequent requests can retry.
void realtimeReady.catch(() => console.error('[Redis] Realtime unavailable'));

// Cron does not depend on the Socket.IO datastore connection becoming ready.
app.use('/api/internal/cron/crm', cronRouter);

app.use(async (_req, res, next) => {
  try {
    await sharedRedis.initializeAdapter(io);
    next();
  } catch {
    res.status(503).json({ error: 'Service temporarily unavailable' });
  }
});

io.use(async (socket, next) => {
  try {
    await sharedRedis.initializeAdapter(io);
    if (requiresSharedSocketState && !redisUrl()) throw new Error('Realtime unavailable');

    const authToken = socket.handshake.auth?.['token'];
    const authorization = socket.handshake.headers.authorization;
    const bearerToken = authorization?.startsWith('Bearer ')
      ? authorization.slice('Bearer '.length)
      : undefined;
    const token = typeof authToken === 'string' ? authToken : bearerToken;
    if (!token) throw new Error('Authentication token required');

    socket.data['user'] = await resolveAccessToken(token);
    next();
  } catch {
    next(new Error('Unauthorized'));
  }
});

io.on('connection', (socket) => {
  console.log('Socket client connected:', socket.id);

  const restaurantId = socket.data['user']?.restaurantId as string | undefined;
  if (restaurantId) socket.join(restaurantId);

  socket.on('disconnect', () => {
    console.log('Socket client disconnected:', socket.id);
  });
});

const port = process.env.PORT || 5000;
const isProduction = process.env.NODE_ENV === 'production';

app.use(helmet({
  contentSecurityPolicy: false,
  strictTransportSecurity: isProduction
    ? { maxAge: 31_536_000, includeSubDomains: true }
    : false,
  referrerPolicy: { policy: 'no-referrer' },
  frameguard: { action: 'deny' },
}));
app.use(cors(corsOptions));
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

// Meta WhatsApp Webhook route
app.use('/api/webhook/whatsapp', whatsappRouter);

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
export { app, server, io };
