'use strict';
const { test, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { prisma, violations } = require('./support/isolation.cjs');

after(() => assert.equal(violations.length, 0));

test('campaign lifecycle: disconnected create is a true draft and does not validate provider state', async t => {
  const { CampaignService } = require('../dist/services/crm/campaign.service');
  let validated = 0; let saved;
  void prisma.campaign.create;
  t.mock.method(prisma.campaign, 'create', async ({ data }) => { saved = data; return { id: 'draft-1', ...data }; });
  const service = new CampaignService({ prepareNew: async () => { validated++; throw new Error('offline'); } });
  const draft = await service.createCampaign('brand-a', {
    name: 'Offline draft', channel: 'WHATSAPP', segmentId: null, templateBody: 'welcome',
    whatsappTemplateId: 'template-a', whatsappTemplateLanguage: 'en_US',
    whatsappTemplateCategory: 'MARKETING', whatsappTemplateParameters: { 'body.1': 'Asha' },
    scheduledAt: new Date('2026-09-23T00:00:00Z'),
  });
  assert.equal(validated, 0);
  assert.equal(saved.status, 'DRAFT');
  assert.equal(draft.status, 'DRAFT');
  assert.equal(saved.templateBody, 'welcome');
});

test('campaign lifecycle: queue freezes a brand-scoped snapshot only after validation', async t => {
  const { CampaignService } = require('../dist/services/crm/campaign.service');
  const campaign = { id: 'draft-1', brandId: 'brand-a', crmGeneration: 2, channel: 'WHATSAPP', status: 'DRAFT', segmentId: 'segment-a' };
  const creates = [];
  void prisma.campaign.findFirst; void prisma.customerSegment.findMany; void prisma.campaignLog.createMany; void prisma.campaign.updateMany;
  t.mock.method(prisma, '$transaction', async callback => callback(prisma));
  t.mock.method(prisma.campaign, 'findFirst', async () => campaign);
  t.mock.method(prisma.customerSegment, 'findMany', async ({ where }) => {
    assert.equal(where.segmentId, 'segment-a');
    assert.equal(where.customer.brandId, 'brand-a');
    return [{ customerId: 'customer-a' }, { customerId: 'customer-b' }];
  });
  t.mock.method(prisma.campaignLog, 'createMany', async ({ data, skipDuplicates }) => { creates.push(...data); assert.equal(skipDuplicates, true); return { count: data.length }; });
  t.mock.method(prisma.campaign, 'updateMany', async ({ where, data }) => {
    assert.equal(where.status, 'DRAFT'); assert.equal(data.status, 'QUEUED'); return { count: 1 };
  });
  const service = new CampaignService({ prepareNew: async () => ({
    template: { id: 'template-a', templateName: 'welcome', languageCode: 'en_US', category: 'MARKETING' },
    parameterValues: {}, connectionVersion: '00000000-0000-4000-8000-000000000001',
  }) });
  assert.equal(await service.queueDraft('brand-a', 'draft-1'), true);
  assert.deepEqual(creates.map(x => x.customerId), ['customer-a', 'customer-b']);
});

test('campaign lifecycle: cancellation is non-destructive and separates unclaimed, not-started, and provider-uncertain work', async t => {
  const { CampaignService } = require('../dist/services/crm/campaign.service');
  const updates = [];
  void prisma.campaign.updateMany; void prisma.campaignLog.updateMany;
  t.mock.method(prisma.campaign, 'updateMany', async ({ where, data }) => {
    assert.equal(where.brandId, 'brand-a'); assert.deepEqual(where.status.in, ['DRAFT', 'QUEUED', 'FAILED', 'SENDING']);
    assert.equal(data.status, 'CANCELLED'); return { count: 1 };
  });
  t.mock.method(prisma.campaignLog, 'updateMany', async args => { updates.push(args); return { count: 1 }; });
  assert.equal(await new CampaignService().cancelCampaign('brand-a', 'campaign-a'), true);
  assert.deepEqual(updates.map(x => x.data.status), ['CANCELLED', 'CANCELLED', 'PENDING_RECONCILIATION']);
  assert.deepEqual(updates[0].where.status.in, ['PENDING', 'FAILED']);
  assert.equal(updates[1].where.status, 'DISPATCHING');
  assert.equal(updates[1].where.providerDispatchStartedAt, null);
  assert.equal(updates[2].where.status, 'DISPATCHING');
  assert.notEqual(updates[2].where.providerDispatchStartedAt, null);
});

test('campaign cancellation visible after a recipient claim prevents provider dispatch', async t => {
  const { CampaignService } = require('../dist/services/crm/campaign.service');
  const { WhatsAppService } = require('../dist/services/whatsapp.service');
  void prisma.campaign.findFirst; void prisma.customer.findFirst;
  t.mock.method(prisma.campaign, 'findFirst', async ({ where }) => {
    assert.equal(where.status, 'SENDING');
    return null;
  });
  t.mock.method(prisma.customer, 'findFirst', async () => ({ id: 'customer-a', phone: '911234567890', phoneVerifiedAt: new Date() }));
  let providerCalls = 0;
  t.mock.method(WhatsAppService, 'sendTemplateMessage', async () => { providerCalls++; return { messages: [{ id: 'wamid' }] }; });
  await assert.rejects(
    new CampaignService().deliverRecipient({ campaignId: 'campaign-a', customerId: 'customer-a', brandId: 'brand-a', idempotencyKey: 'ignored' }),
    /not eligible/,
  );
  assert.equal(providerCalls, 0);
});

test('campaign dispatch gate suppresses Meta calls when cancellation wins before request start', async t => {
  const { CampaignService } = require('../dist/services/crm/campaign.service');
  const { ConsentService } = require('../dist/services/crm/consent.service');
  const { WhatsAppConnectionService } = require('../dist/services/crm/whatsapp-connection.service');
  const { WhatsAppService } = require('../dist/services/whatsapp.service');
  void prisma.campaign.findFirst; void prisma.customer.findFirst; void prisma.campaignLog.updateMany;
  t.mock.method(prisma.campaign, 'findFirst', async () => ({ id: 'campaign-a', brandId: 'brand-a', channel: 'WHATSAPP', status: 'SENDING' }));
  t.mock.method(prisma.customer, 'findFirst', async () => ({ id: 'customer-a', phone: '911234567890', phoneVerifiedAt: new Date() }));
  t.mock.method(prisma.campaignLog, 'updateMany', async ({ where }) => {
    assert.equal(where.providerDispatchStartedAt, null);
    return { count: 0 };
  });
  t.mock.method(ConsentService.prototype, 'canSendWhatsAppMarketing', async () => true);
  t.mock.method(WhatsAppConnectionService.prototype, 'assertCurrentVerified', async () => {});
  let providerCalls = 0;
  t.mock.method(WhatsAppService, 'sendTemplateMessage', async () => { providerCalls++; return { messages: [{ id: 'wamid' }] }; });
  const service = new CampaignService({ validate: async () => ({
    schema: { version: 1, parameters: [] }, parameterValues: {},
    template: { templateName: 'welcome', languageCode: 'en_US' },
    current: { phoneNumberId: 'sender-a', accessToken: 'test-only-token' },
  }) });
  await assert.rejects(
    service.deliverRecipient({ campaignId: 'campaign-a', customerId: 'customer-a', brandId: 'brand-a', idempotencyKey: 'ignored' }),
    /cancelled or recipient claim changed/,
  );
  assert.equal(providerCalls, 0);
});

test('campaign webhook ingress refuses status transitions without a resolved sender identity', () => {
  const route = fs.readFileSync(path.join(__dirname, '../src/routes/whatsapp.routes.ts'), 'utf8');
  assert.match(route, /if \(typeof senderId !== 'string'\) continue;\s*await new CampaignService\(\)\.applyWebhookStatus\(status\.id, next, senderId\)/s);
});

test('campaign lifecycle: webhook transitions are monotonic and cancellation-safe', () => {
  const { webhookTransition } = require('../dist/services/crm/campaign.service');
  assert.equal(webhookTransition('SENT', 'DELIVERED', false), 'DELIVERED');
  assert.equal(webhookTransition('DELIVERED', 'SENT', false), null);
  assert.equal(webhookTransition('READ', 'FAILED', false), null);
  assert.equal(webhookTransition('PENDING_RECONCILIATION', 'DELIVERED', true), 'DELIVERED');
  assert.equal(webhookTransition('CANCELLED', 'READ', true), null);
  assert.equal(webhookTransition('FAILED', 'READ', false), 'READ');
});

test('campaign lifecycle migration is additive, durable, and follows reconciliation', () => {
  const schema = fs.readFileSync(path.join(__dirname, '../prisma/schema.prisma'), 'utf8');
  const migrations = fs.readdirSync(path.join(__dirname, '../prisma/migrations'), { withFileTypes: true })
    .filter(entry => entry.isDirectory()).map(entry => entry.name).sort();
  const next = migrations.find(x => x > '20260923000000_campaign_provider_reconciliation');
  assert.ok(next, 'expected an additive migration after provider reconciliation');
  const sql = fs.readFileSync(path.join(__dirname, '../prisma/migrations', next, 'migration.sql'), 'utf8');
  assert.match(schema, /model CampaignRequest/);
  assert.match(schema, /@@unique\(\[brandId, operation, key\]\)/);
  assert.match(sql, /UNIQUE \("brand_id", "operation", "key"\)/);
  assert.match(sql, /ADD VALUE IF NOT EXISTS 'CANCELLED'/);
  assert.match(schema, /providerDispatchStartedAt DateTime\?/);
  assert.match(sql, /"provider_dispatch_started_at" TIMESTAMP\(3\)/);
  assert.doesNotMatch(sql, /\b(?:DELETE\s+FROM|TRUNCATE|DROP)\b/i);
});

test('campaign idempotency: retries and concurrent duplicates return one durable intent while conflicts reject', async t => {
  const { CampaignService } = require('../dist/services/crm/campaign.service');
  const requests = new Map(); const committed = new Map(); let sequence = 0; let lock = Promise.resolve();
  const keyOf = ({ brandId, operation, key }) => `${brandId}:${operation}:${key}`;
  void prisma.campaignRequest.findUnique; void prisma.campaignRequest.create; void prisma.campaign.findFirst; void prisma.campaign.create;
  t.mock.method(prisma.campaignRequest, 'findUnique', async ({ where }) => requests.get(keyOf(where.brandId_operation_key)) ?? null);
  t.mock.method(prisma.campaign, 'findFirst', async ({ where }) => committed.get(where.id) ?? null);
  t.mock.method(prisma, '$transaction', async callback => {
    let release; const previous = lock; lock = new Promise(resolve => { release = resolve; }); await previous;
    const staged = [];
    const tx = {
      segment: prisma.segment,
      campaign: { create: async ({ data }) => { const row = { id: `campaign-${++sequence}`, ...data }; staged.push(row); return row; } },
      campaignRequest: { create: async ({ data }) => {
        const compound = keyOf(data); if (requests.has(compound)) throw Object.assign(new Error('unique'), { code: 'P2002' });
        const row = { ...data }; requests.set(compound, row); for (const campaign of staged) committed.set(campaign.id, campaign); return row;
      } },
    };
    try { return await callback(tx); } finally { release(); }
  });
  const input = { name: 'Draft', channel: 'WHATSAPP', segmentId: null, templateBody: 'welcome', whatsappTemplateId: 'template-a', whatsappTemplateLanguage: 'en_US', whatsappTemplateCategory: 'MARKETING', whatsappTemplateParameters: {}, scheduledAt: new Date('2026-09-23T00:00:00Z') };
  const service = new CampaignService();
  const [left, right] = await Promise.all([service.createCampaign('brand-a', input, 'same-key'), service.createCampaign('brand-a', input, 'same-key')]);
  assert.equal(left.id, right.id); assert.equal(committed.size, 1);
  assert.equal((await service.createCampaign('brand-a', input, 'same-key')).id, left.id);
  await assert.rejects(service.createCampaign('brand-a', { ...input, name: 'Changed' }, 'same-key'), error => error.code === 'CAMPAIGN_IDEMPOTENCY_CONFLICT');
});

test('campaign queue idempotency returns the successful queue result to a concurrent duplicate', async t => {
  const { CampaignService } = require('../dist/services/crm/campaign.service');
  const campaign = { id: 'draft-queue', brandId: 'brand-a', crmGeneration: 2, channel: 'WHATSAPP', status: 'DRAFT', segmentId: null };
  const requests = new Map(); let lock = Promise.resolve();
  const compound = input => `${input.brandId}:${input.operation}:${input.key}`;
  void prisma.campaign.findFirst; void prisma.customer.findMany; void prisma.campaign.updateMany; void prisma.campaignRequest.findUnique;
  t.mock.method(prisma.campaign, 'findFirst', async ({ where }) => {
    if (where.id !== campaign.id || where.brandId !== campaign.brandId) return null;
    if (where.status && where.status !== campaign.status) return null;
    return { ...campaign };
  });
  t.mock.method(prisma.customer, 'findMany', async () => []);
  t.mock.method(prisma.campaignRequest, 'findUnique', async ({ where }) => requests.get(compound(where.brandId_operation_key)) ?? null);
  t.mock.method(prisma, '$transaction', async callback => {
    let release; const previous = lock; lock = new Promise(resolve => { release = resolve; }); await previous;
    const tx = {
      campaign: {
        findFirst: async ({ where }) => where.status === campaign.status ? { ...campaign } : null,
        updateMany: async ({ where, data }) => {
          if (where.status !== campaign.status) return { count: 0 };
          Object.assign(campaign, data); return { count: 1 };
        },
      },
      customer: prisma.customer,
      campaignLog: prisma.campaignLog,
      campaignRequest: {
        findUnique: async ({ where }) => requests.get(compound(where.brandId_operation_key)) ?? null,
        create: async ({ data }) => {
        const key = compound(data); if (requests.has(key)) throw Object.assign(new Error('unique'), { code: 'P2002' });
        requests.set(key, { ...data }); return data;
      } },
    };
    try { return await callback(tx); } finally { release(); }
  });
  const service = new CampaignService({ prepareNew: async () => ({
    template: { id: 'template-a', templateName: 'welcome', languageCode: 'en_US', category: 'MARKETING' },
    parameterValues: {}, connectionVersion: '00000000-0000-4000-8000-000000000001',
  }) });
  const results = await Promise.all([
    service.queueDraft('brand-a', 'draft-queue', 'queue-key'),
    service.queueDraft('brand-a', 'draft-queue', 'queue-key'),
  ]);
  assert.deepEqual(results, [true, true]);
  assert.equal(requests.size, 1);
});

test('campaign queue snapshot is frozen and dispatch permanently excludes revoked consent', async t => {
  const { CampaignService } = require('../dist/services/crm/campaign.service');
  const campaign = { id: 'campaign-a', brandId: 'brand-a', crmGeneration: 2, channel: 'WHATSAPP', status: 'DRAFT', segmentId: 'segment-a', attemptCount: 0 };
  const logs = new Map(); const delivered = [];
  void prisma.campaign.findFirst; void prisma.campaign.updateMany; void prisma.customerSegment.findMany; void prisma.campaignLog.createMany; void prisma.campaignLog.findMany; void prisma.campaignLog.updateMany; void prisma.customer.findFirst; void prisma.customerConsent.findFirst;
  t.mock.method(prisma, '$transaction', async callback => callback(prisma));
  t.mock.method(prisma.campaign, 'findFirst', async ({ where }) => (!where.status || where.status === campaign.status) ? { ...campaign } : null);
  t.mock.method(prisma.campaign, 'updateMany', async ({ where, data }) => {
    if (where.status?.in && !where.status.in.includes(campaign.status)) return { count: 0 };
    if (typeof where.status === 'string' && where.status !== campaign.status) return { count: 0 };
    if (data.attemptCount?.increment) campaign.attemptCount++;
    Object.assign(campaign, data, { attemptCount: campaign.attemptCount }); return { count: 1 };
  });
  t.mock.method(prisma.customerSegment, 'findMany', async () => [{ customerId: 'kept' }, { customerId: 'revoked' }]);
  t.mock.method(prisma.campaignLog, 'createMany', async ({ data }) => { for (const row of data) logs.set(row.customerId, { ...row, attemptCount: 0 }); return { count: data.length }; });
  t.mock.method(prisma.campaignLog, 'findMany', async () => [...logs.values()]);
  t.mock.method(prisma.customer, 'findFirst', async ({ where }) => ({ id: where.id, phone: '911234567890', phoneVerifiedAt: new Date() }));
  t.mock.method(prisma.customerConsent, 'findFirst', async ({ where }) => ({ granted: where.customerId === 'kept' }));
  t.mock.method(prisma.campaignLog, 'updateMany', async ({ where, data }) => {
    const row = logs.get(where.customerId); if (!row) return { count: 0 };
    if (where.status?.in && !where.status.in.includes(row.status)) return { count: 0 };
    if (typeof where.status === 'string' && where.status !== row.status) return { count: 0 };
    if (data.attemptCount?.increment) row.attemptCount++; Object.assign(row, data, { attemptCount: row.attemptCount }); return { count: 1 };
  });
  const validator = { prepareNew: async () => ({ template: { id: 'template-a', templateName: 'welcome', languageCode: 'en_US', category: 'MARKETING' }, parameterValues: {}, connectionVersion: '00000000-0000-4000-8000-000000000001' }), validate: async () => ({}) };
  const service = new CampaignService(validator); t.mock.method(CampaignService.prototype, 'deliverRecipient', async input => delivered.push(input.customerId));
  assert.equal(await service.queueDraft('brand-a', campaign.id), true);
  assert.deepEqual([...logs.keys()], ['kept', 'revoked']);
  assert.equal(await service.sendCampaign(campaign.id, 'brand-a'), false);
  assert.deepEqual(delivered, ['kept']); assert.equal(logs.get('revoked').status, 'PERMANENTLY_INELIGIBLE'); assert.equal(logs.has('audience-added-later'), false);
});

test('campaign worker cannot claim a cancelled campaign', async t => {
  const { CampaignService } = require('../dist/services/crm/campaign.service'); let delivered = false;
  void prisma.campaign.updateMany;
  t.mock.method(prisma.campaign, 'updateMany', async ({ where }) => { assert.deepEqual(where.status.in, ['QUEUED', 'FAILED']); return { count: 0 }; });
  t.mock.method(CampaignService.prototype, 'deliverRecipient', async () => { delivered = true; });
  assert.equal(await new CampaignService().sendCampaign('cancelled', 'brand-a'), true); assert.equal(delivered, false);
});

test('campaign webhook status application is brand scoped, duplicate safe, and monotonic', async t => {
  const { CampaignService } = require('../dist/services/crm/campaign.service');
  const row = { id: 'log-a', providerMessageId: 'wamid-a', status: 'SENT', campaign: { status: 'COMPLETED', brandId: 'brand-a' } };
  void prisma.brandWhatsAppConnection.findUnique; void prisma.campaignLog.findFirst; void prisma.campaignLog.updateMany;
  t.mock.method(prisma.brandWhatsAppConnection, 'findUnique', async ({ where }) => where.phoneNumberId === 'sender-a' ? { brandId: 'brand-a' } : null);
  t.mock.method(prisma.campaignLog, 'findFirst', async ({ where }) => where.providerMessageId === row.providerMessageId && (!where.campaign || where.campaign.brandId === row.campaign.brandId) ? { ...row, campaign: { ...row.campaign } } : null);
  t.mock.method(prisma.campaignLog, 'updateMany', async ({ where, data }) => { if (where.status !== row.status) return { count: 0 }; row.status = data.status; return { count: 1 }; });
  const service = new CampaignService();
  assert.equal(await service.applyWebhookStatus('wamid-a', 'DELIVERED', 'sender-a'), true);
  assert.equal(await service.applyWebhookStatus('wamid-a', 'SENT', 'sender-a'), false);
  assert.equal(await service.applyWebhookStatus('wamid-a', 'DELIVERED', 'sender-a'), false);
  assert.equal(await service.applyWebhookStatus('wamid-a', 'READ', 'wrong-sender'), false);
  assert.equal(await service.applyWebhookStatus('unknown', 'READ'), false);
  assert.equal(row.status, 'DELIVERED');
});

test('campaign HTTP layer uses effective restaurant brand and exposes compatible edit/cancel/template routes', async t => {
  const { CampaignController } = require('../dist/controllers/crm/campaign.controller');
  const { CampaignService } = require('../dist/services/crm/campaign.service');
  const source = fs.readFileSync(path.join(__dirname, '../src/routes/crm/campaign.routes.ts'), 'utf8');
  assert.match(source, /router\.patch\('\/:id'/); assert.match(source, /router\.post\('\/:id\/cancel'/);
  assert.match(fs.readFileSync(path.join(__dirname, '../src/routes/crm/v2.routes.ts'), 'utf8'), /idempotency-key/);
  void prisma.restaurant.findFirst;
  t.mock.method(prisma.restaurant, 'findFirst', async ({ where }) => { assert.deepEqual(where, { id: 'restaurant-b', isActive: true }); return { id: 'restaurant-b', brandId: 'brand-b' }; });
  t.mock.method(CampaignService.prototype, 'getCampaigns', async brandId => { assert.equal(brandId, 'brand-b'); return { campaigns: [], pagination: { limit: 50, nextCursor: null, hasMore: false } }; });
  const res = { statusCode: 200, status(code) { this.statusCode = code; return this; }, json(body) { this.body = body; return this; } };
  await new CampaignController().getCampaigns({ user: { id: 'user', restaurantId: 'restaurant-b' }, query: {}, headers: {} }, res);
  assert.equal(res.statusCode, 200); assert.deepEqual(res.body.campaigns, []);
  const controller = fs.readFileSync(path.join(__dirname, '../src/controllers/crm/campaign.controller.ts'), 'utf8');
  assert.match(controller, /selectedTemplateId/); assert.match(controller, /whatsappTemplateId/);
});
