import { Router } from 'express';
import { PublicController } from '../controllers/public.controller';
import { rateLimit } from 'express-rate-limit';
import { prisma } from '../lib/prisma';
import { PhoneVerificationService } from '../services/crm/phone-verification.service';
import { ConsentService } from '../services/crm/consent.service';
import { randomUUID } from 'node:crypto';

const router = Router();
const publicController = new PublicController();
const verification = new PhoneVerificationService();
const verificationLimiter = rateLimit({ windowMs: 15 * 60_000, limit: 10, standardHeaders: 'draft-7', legacyHeaders: false });

// No authentication required for these routes — they are customer-facing
router.get('/:slug', (req, res) => publicController.getRestaurantMenu(req, res));
router.get('/:slug/loyalty/balance', (req, res) => publicController.getLoyaltyBalance(req, res));
router.post('/:slug/loyalty/verification/start', verificationLimiter, async (req, res) => {
  const restaurant = await prisma.restaurant.findUnique({ where: { slug: String(req.params['slug']) }, select: { brandId: true } });
  if (!restaurant?.brandId || typeof req.body?.phone !== 'string') { res.status(400).json({ error: 'Invalid request' }); return; }
  try {
    await verification.start(restaurant.brandId, req.body.phone);
    res.json({ message: 'If the number can receive WhatsApp messages, a code has been sent.' });
  } catch { res.status(503).json({ error: 'Phone verification is unavailable' }); }
});
router.post('/:slug/loyalty/verification/confirm', verificationLimiter, async (req, res) => {
  const restaurant = await prisma.restaurant.findUnique({ where: { slug: String(req.params['slug']) }, select: { brandId: true } });
  if (!restaurant?.brandId || typeof req.body?.phone !== 'string' || typeof req.body?.code !== 'string') { res.status(400).json({ error: 'Invalid request' }); return; }
  try {
    const token = await verification.verify(restaurant.brandId, req.body.phone, req.body.code);
    if (!token) { res.status(400).json({ error: 'Invalid or expired code' }); return; }
    res.json({ token, expiresInSeconds: 900 });
  } catch { res.status(400).json({ error: 'Invalid or expired code' }); }
});
router.post('/:slug/whatsapp/opt-out', verificationLimiter, async (req, res) => {
  const restaurant = await prisma.restaurant.findUnique({ where: { slug: String(req.params['slug']) }, select: { brandId: true } });
  if (!restaurant?.brandId || typeof req.body?.phone !== 'string' || typeof req.body?.token !== 'string') {
    res.status(400).json({ error: 'Invalid request' }); return;
  }
  if (!await verification.hasSession(restaurant.brandId, req.body.phone, req.body.token)) {
    res.status(401).json({ error: 'Phone verification required' }); return;
  }
  const phone = req.body.phone.replace(/\D/g, '');
  const normalized = phone.length === 10 ? `91${phone}` : phone;
  const customer = await prisma.customer.findFirst({ where: { brandId: restaurant.brandId, phone: normalized, crmGeneration: 2 }, select: { id: true } });
  if (customer) await new ConsentService().recordWhatsAppMarketing(customer.id, false, `GUEST:${randomUUID()}`);
  res.json({ optedIn: false });
});
router.post('/:slug/orders', (req, res) => publicController.placeOrder(req, res));
router.post('/:slug/referral/claim', (req, res) => publicController.claimReferral(req, res));
router.get('/:slug/orders/:orderId/status', (req, res) => publicController.getOrderStatus(req, res));
router.post('/:slug/tables/:tableNumber/assistance', (req, res) => publicController.requestAssistance(req, res));
router.post('/:slug/cart/ping', (req, res) => publicController.pingCart(req, res));

export default router;
