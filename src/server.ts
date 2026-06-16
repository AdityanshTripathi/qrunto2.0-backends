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


const app = express();
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

// Public customer-facing routes (no auth)
app.use('/api/public', publicRouter);

// Health check endpoint
app.get('/health', (req: Request, res: Response) => {
  res.status(200).json({ status: 'OK', message: 'OrderFlow API is running' });
});

if (!process.env.VERCEL) {
  app.listen(port, () => {
    console.log(`Server is running on port ${port}`);
  });
}

export default app;
