import { Router, Response } from 'express';
import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import { Prisma } from '@prisma/client';
import { prisma } from '../../lib/prisma';
import { authenticate, AuthenticatedRequest, requireRestaurantContext, requireRoles } from '../../middlewares/auth.middleware';
import { ConsentService } from '../../services/crm/consent.service';
import { CampaignService } from '../../services/crm/campaign.service';
import { WhatsAppConnectionService } from '../../services/crm/whatsapp-connection.service';

const router = Router();
router.use(authenticate, requireRoles(['RESTAURANT_OWNER', 'SUPER_ADMIN']), requireRestaurantContext);

async function brandFor(req: AuthenticatedRequest, res: Response): Promise<string | null> {
  const restaurant = await prisma.restaurant.findFirst({
    where: { id: req.user!.restaurantId!, isActive: true }, select: { brandId: true },
  });
  if (!restaurant?.brandId) { res.status(404).json({ error: 'Active brand context not found' }); return null; }
  return restaurant.brandId;
}

router.get('/overview', async (req: AuthenticatedRequest, res) => {
  const brandId = await brandFor(req, res); if (!brandId) return;
  const now = new Date();
  const monthAgo = new Date(now.getTime() - 30 * 24 * 60 * 60_000);
  const base = { brandId, crmGeneration: 2 };
  const [total, repeat, lapsed, recent, optedIn] = await Promise.all([
    prisma.customer.count({ where: base }),
    prisma.customer.count({ where: { ...base, brandVisitCount: { gte: 2 } } }),
    prisma.customer.count({ where: { ...base, brandVisitCount: { gt: 0 }, brandLastVisitAt: { lt: monthAgo } } }),
    prisma.customer.count({ where: { ...base, createdAt: { gte: monthAgo } } }),
    prisma.$queryRaw<Array<{ count: bigint }>>`
      SELECT count(*)::bigint AS count FROM customers c
      WHERE c.brand_id = ${brandId} AND c.crm_generation = 2
        AND (SELECT cc.granted FROM customer_consents cc
             WHERE cc.customer_id = c.id AND cc.channel = 'WHATSAPP' AND cc.purpose = 'MARKETING'
             ORDER BY cc.recorded_at DESC, cc.id DESC LIMIT 1) = true`,
  ]);
  res.json({ total, repeat, lapsed, recent, optedIn: Number(optedIn[0]?.count ?? 0), repeatRate: total ? Math.round(repeat / total * 100) : 0 });
});

router.get('/customers', async (req: AuthenticatedRequest, res) => {
  const brandId = await brandFor(req, res); if (!brandId) return;
  const query = z.object({
    search: z.string().trim().max(100).optional(),
    segment: z.enum(['all', 'first', 'regular', 'vip', 'lapsed']).default('all'),
    page: z.coerce.number().int().min(1).default(1),
  }).safeParse(req.query);
  if (!query.success) { res.status(400).json({ error: 'Invalid directory filters' }); return; }
  const { search, segment, page } = query.data;
  const where: any = { brandId, crmGeneration: 2 };
  if (search) where.OR = [{ name: { contains: search, mode: 'insensitive' } }, { phone: { contains: search.replace(/\D/g, ''), mode: 'insensitive' } }];
  if (segment === 'first') where.brandVisitCount = 1;
  if (segment === 'regular') where.brandVisitCount = { gte: 2 };
  if (segment === 'vip') where.brandTotalSpend = { gte: 10000 };
  if (segment === 'lapsed') {
    where.brandVisitCount = { gt: 0 };
    where.brandLastVisitAt = { lt: new Date(Date.now() - 30 * 24 * 60 * 60_000) };
  }
  const [customers, total] = await Promise.all([
    prisma.customer.findMany({
      where, orderBy: [{ brandLastVisitAt: 'desc' }, { createdAt: 'desc' }], skip: (page - 1) * 25, take: 25,
      select: { id: true, name: true, phone: true, createdAt: true, brandTotalSpend: true, brandVisitCount: true, brandLastVisitAt: true, acquisitionSource: true,
        loyaltyAccount: { select: { pointsBalance: true } } },
    }),
    prisma.customer.count({ where }),
  ]);
  res.json({ customers, total, page, pageSize: 25 });
});

router.get('/customers/:id', async (req: AuthenticatedRequest, res) => {
  const brandId = await brandFor(req, res); if (!brandId) return;
  const customer = await prisma.customer.findFirst({
    where: { id: String(req.params['id']), brandId, crmGeneration: 2 },
    include: {
      profiles: { include: { restaurant: { select: { name: true } } } },
      orders: { where: { status: 'PAID', restaurant: { brandId } }, orderBy: { createdAt: 'desc' }, take: 30,
        include: { orderItems: true, restaurant: { select: { name: true } } } },
      notes: { orderBy: { createdAt: 'desc' }, take: 30, include: { user: { select: { name: true } } } },
      feedbacks: { orderBy: { createdAt: 'desc' }, take: 20 },
      loyaltyAccount: { include: { ledger: { orderBy: { createdAt: 'desc' }, take: 30 } } },
      consents: { where: { channel: 'WHATSAPP', purpose: 'MARKETING' }, orderBy: [{ recordedAt: 'desc' }, { id: 'desc' }], take: 10 },
    },
  });
  if (!customer) { res.status(404).json({ error: 'Guest not found' }); return; }
  res.json({ customer });
});

router.put('/customers/:id/preferences', async (req: AuthenticatedRequest, res) => {
  const brandId = await brandFor(req, res); if (!brandId) return;
  const parsed = z.object({
    name: z.string().trim().min(1).max(100).optional(),
    email: z.email().nullable().optional(),
    dietaryPreference: z.string().trim().max(80).nullable().optional(),
    seatingPreference: z.string().trim().max(80).nullable().optional(),
    allergyNote: z.string().trim().max(300).nullable().optional(),
    birthday: z.iso.datetime().nullable().optional(),
    anniversary: z.iso.datetime().nullable().optional(),
  }).safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: 'Invalid guest preferences' }); return; }
  const existing = await prisma.customer.findFirst({ where: { id: String(req.params['id']), brandId, crmGeneration: 2 }, select: { id: true } });
  if (!existing) { res.status(404).json({ error: 'Guest not found' }); return; }
  const { birthday, anniversary, ...fields } = parsed.data;
  const definedFields = Object.fromEntries(Object.entries(fields).filter(([, value]) => value !== undefined)) as Prisma.CustomerUpdateInput;
  const customer = await prisma.customer.update({ where: { id: existing.id }, data: {
    ...definedFields,
    ...(birthday !== undefined ? { birthday: birthday ? new Date(birthday) : null } : {}),
    ...(anniversary !== undefined ? { anniversary: anniversary ? new Date(anniversary) : null } : {}),
  } });
  res.json({ customer });
});

router.post('/customers/:id/notes', async (req: AuthenticatedRequest, res) => {
  const brandId = await brandFor(req, res); if (!brandId) return;
  const parsed = z.object({ noteText: z.string().trim().min(1).max(1000) }).safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: 'Invalid note' }); return; }
  const customer = await prisma.customer.findFirst({ where: { id: String(req.params['id']), brandId, crmGeneration: 2 }, select: { id: true } });
  if (!customer) { res.status(404).json({ error: 'Guest not found' }); return; }
  const note = await prisma.customerNote.create({ data: { customerId: customer.id, userId: req.user!.id, noteText: parsed.data.noteText } });
  res.status(201).json({ note });
});

router.post('/customers/:id/whatsapp-opt-out', async (req: AuthenticatedRequest, res) => {
  const brandId = await brandFor(req, res); if (!brandId) return;
  const customer = await prisma.customer.findFirst({ where: { id: String(req.params['id']), brandId, crmGeneration: 2 }, select: { id: true } });
  if (!customer) { res.status(404).json({ error: 'Guest not found' }); return; }
  await new ConsentService().recordWhatsAppMarketing(customer.id, false, `STAFF:${req.user!.id}:${randomUUID()}`);
  res.json({ optedIn: false });
});

router.get('/loyalty-policy', async (req: AuthenticatedRequest, res) => {
  const brandId = await brandFor(req, res); if (!brandId) return;
  const policy = await prisma.crmLoyaltyPolicy.findUnique({ where: { brandId } });
  res.json({ pointsPerHundredRupees: policy?.pointsPerHundredRupees ?? 1, maxRedemptionPercent: policy?.maxRedemptionPercent ?? 20 });
});

router.put('/loyalty-policy', async (req: AuthenticatedRequest, res) => {
  const brandId = await brandFor(req, res); if (!brandId) return;
  const parsed = z.object({ pointsPerHundredRupees: z.number().int().min(0).max(20), maxRedemptionPercent: z.number().int().min(0).max(100) }).safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: 'Invalid loyalty settings' }); return; }
  const policy = await prisma.crmLoyaltyPolicy.upsert({ where: { brandId }, create: { brandId, ...parsed.data }, update: parsed.data });
  res.json({ policy });
});

router.get('/whatsapp-status', async (req: AuthenticatedRequest, res) => {
  const brandId = await brandFor(req, res); if (!brandId) return;
  const status = await new WhatsAppConnectionService().status(brandId);
  res.json({ ...status, authTemplateConfigured: Boolean(process.env.WHATSAPP_AUTH_TEMPLATE_NAME) });
});

router.put('/whatsapp-connection', async (req: AuthenticatedRequest, res) => {
  const brandId = await brandFor(req, res); if (!brandId) return;
  const parsed = z.object({
    phoneNumberId: z.string().regex(/^\d{8,30}$/),
    accessToken: z.string().min(20).max(3000),
    languageCode: z.string().regex(/^[a-z]{2}_[A-Z]{2}$/).default('en_US'),
  }).safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: 'Invalid WhatsApp connection settings' }); return; }
  try {
    await new WhatsAppConnectionService().save(brandId, parsed.data.phoneNumberId, parsed.data.accessToken, parsed.data.languageCode);
    res.json({ configured: true, phoneNumberId: parsed.data.phoneNumberId, languageCode: parsed.data.languageCode });
  } catch { res.status(503).json({ error: 'WhatsApp connection could not be saved' }); }
});

router.post('/campaigns/:id/queue', async (req: AuthenticatedRequest, res) => {
  const brandId = await brandFor(req, res); if (!brandId) return;
  const queued = await new CampaignService().queueDraft(brandId, String(req.params['id']));
  if (!queued) { res.status(409).json({ error: 'WhatsApp is unavailable or the campaign is not a draft' }); return; }
  res.json({ queued: true });
});

export default router;
