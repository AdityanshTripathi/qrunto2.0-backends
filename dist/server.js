"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
/// <reference path="./types/express.d.ts" />
require("dotenv/config"); // Loaded env variables
const express_1 = __importDefault(require("express"));
const cors_1 = __importDefault(require("cors"));
const auth_routes_1 = __importDefault(require("./routes/auth.routes"));
const plan_routes_1 = __importDefault(require("./routes/plan.routes"));
const subscription_routes_1 = __importDefault(require("./routes/subscription.routes"));
const category_routes_1 = __importDefault(require("./routes/category.routes"));
const menuItem_routes_1 = __importDefault(require("./routes/menuItem.routes"));
const table_routes_1 = __importDefault(require("./routes/table.routes"));
const public_routes_1 = __importDefault(require("./routes/public.routes"));
const order_routes_1 = __importDefault(require("./routes/order.routes"));
const analytics_routes_1 = __importDefault(require("./routes/analytics.routes"));
const settings_routes_1 = __importDefault(require("./routes/settings.routes"));
const superadmin_routes_1 = __importDefault(require("./routes/superadmin.routes"));
const notification_routes_1 = __importDefault(require("./routes/notification.routes"));
const waiter_routes_1 = __importDefault(require("./routes/waiter.routes"));
const http_1 = __importDefault(require("http"));
const socket_io_1 = require("socket.io");
const app = (0, express_1.default)();
const server = http_1.default.createServer(app);
const io = new socket_io_1.Server(server, {
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
app.use((0, cors_1.default)());
app.use(express_1.default.json());
// Auth routes
app.use('/api/auth', auth_routes_1.default);
// Plan routes
app.use('/api/plans', plan_routes_1.default);
// Subscription routes
app.use('/api/subscriptions', subscription_routes_1.default);
// Category routes
app.use('/api/categories', category_routes_1.default);
// Menu Item routes
app.use('/api/menu-items', menuItem_routes_1.default);
// Table routes
app.use('/api/tables', table_routes_1.default);
// Order routes
app.use('/api/orders', order_routes_1.default);
// Analytics routes
app.use('/api/analytics', analytics_routes_1.default);
// Settings routes
app.use('/api/settings', settings_routes_1.default);
// Superadmin routes
app.use('/api/superadmin', superadmin_routes_1.default);
// Notification routes
app.use('/api/notifications', notification_routes_1.default);
// Waiter routes
app.use('/api/dashboard/waiters', waiter_routes_1.default);
// Public customer-facing routes (no auth)
app.use('/api/public', public_routes_1.default);
// Health check endpoint
app.get('/health', (req, res) => {
    res.status(200).json({ status: 'OK', message: 'OrderFlow API is running' });
});
if (!process.env.VERCEL) {
    server.listen(port, () => {
        console.log(`Server is running on port ${port}`);
    });
}
exports.default = app;
//# sourceMappingURL=server.js.map