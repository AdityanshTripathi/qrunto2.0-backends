'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { prisma } = require('./support/isolation.cjs');

const current = { brandId: 'brand-a', wabaId: 'waba-a', connectionVersion: '11111111-1111-4111-8111-111111111111' };
const template = {
  id: 'template-a', brandId: 'brand-a', wabaId: 'waba-a', templateName: 'welcome', languageCode: 'en_US',
  category: 'MARKETING', approvalStatus: 'APPROVED',
  parameterSchema: { version: 1, parameters: [
    { name: 'header.1', component: 'HEADER', index: 1, type: 'text' },
    { name: 'body.1', component: 'BODY', index: 1, type: 'text' },
  ] },
};

test('campaign selection validation enforces brand, WABA, connection, language, category, and exact parameters', () => {
  const { validateWhatsAppCampaignSelection } = require('../dist/services/crm/whatsapp-template-validation.service');
  const selection = {
    whatsappTemplateId: template.id, whatsappTemplateLanguage: 'en_US', whatsappTemplateCategory: 'MARKETING',
    whatsappTemplateParameters: { 'header.1': 'Asha', 'body.1': '7' }, whatsappConnectionVersion: current.connectionVersion,
  };
  assert.deepEqual(validateWhatsAppCampaignSelection('brand-a', selection, template, current).parameterValues,
    { 'header.1': 'Asha', 'body.1': '7' });
  for (const [changed, code] of [
    [{ template: { ...template, brandId: 'brand-b' } }, 'WHATSAPP_TEMPLATE_UNAVAILABLE'],
    [{ template: { ...template, wabaId: 'waba-old' } }, 'WHATSAPP_TEMPLATE_UNAVAILABLE'],
    [{ template: { ...template, approvalStatus: 'REJECTED' } }, 'WHATSAPP_TEMPLATE_UNAVAILABLE'],
    [{ selection: { ...selection, whatsappConnectionVersion: '22222222-2222-4222-8222-222222222222' } }, 'WHATSAPP_TEMPLATE_STALE'],
    [{ selection: { ...selection, whatsappTemplateLanguage: 'hi' } }, 'WHATSAPP_TEMPLATE_MISMATCH'],
    [{ selection: { ...selection, whatsappTemplateCategory: 'UTILITY' } }, 'WHATSAPP_TEMPLATE_MISMATCH'],
    [{ selection: { ...selection, whatsappTemplateParameters: { 'body.1': '7' } } }, 'WHATSAPP_TEMPLATE_PARAMETERS_INVALID'],
    [{ selection: { ...selection, whatsappTemplateParameters: { ...selection.whatsappTemplateParameters, 'body.2': 'extra' } } }, 'WHATSAPP_TEMPLATE_PARAMETERS_INVALID'],
  ]) {
    assert.throws(() => validateWhatsAppCampaignSelection(
      'brand-a', changed.selection ?? selection, changed.template ?? template, current,
    ), error => error.code === code);
  }
});

test('legacy campaigns without verified cached selection remain readable but fail queue/send validation', () => {
  const { validateWhatsAppCampaignSelection } = require('../dist/services/crm/whatsapp-template-validation.service');
  const legacy = { templateBody: 'legacy_name' };
  assert.throws(() => validateWhatsAppCampaignSelection('brand-a', legacy, null, current),
    error => error.code === 'WHATSAPP_TEMPLATE_SELECTION_REQUIRED');
});

test('validated parameters become Meta header/body components in schema order', () => {
  const { buildTemplateComponents } = require('../dist/services/crm/whatsapp-template-validation.service');
  assert.deepEqual(buildTemplateComponents(template.parameterSchema, { 'header.1': 'Asha', 'body.1': '7' }), [
    { type: 'header', parameters: [{ type: 'text', text: 'Asha' }] },
    { type: 'body', parameters: [{ type: 'text', text: '7' }] },
  ]);
});

test('named template parameters retain their Meta parameter names', () => {
  const { buildTemplateComponents } = require('../dist/services/crm/whatsapp-template-validation.service');
  const schema = { version: 1, parameters: [
    { name: 'body.customer_name', component: 'BODY', index: 1, type: 'text' },
    { name: 'button.0.booking_code', component: 'BUTTON', buttonIndex: 0, index: 1, type: 'text' },
  ] };
  assert.deepEqual(buildTemplateComponents(schema, {
    'body.customer_name': 'Asha', 'button.0.booking_code': 'ABC123',
  }), [
    { type: 'body', parameters: [{ type: 'text', parameter_name: 'customer_name', text: 'Asha' }] },
    { type: 'button', sub_type: 'url', index: '0', parameters: [
      { type: 'text', parameter_name: 'booking_code', text: 'ABC123' },
    ] },
  ]);
});

test('campaign create persists only the server-verified cached identity and parameter values', async t => {
  const { CampaignService } = require('../dist/services/crm/campaign.service');
  let created;
  void prisma.campaign.create;
  t.mock.method(prisma.campaign, 'create', async ({ data }) => { created = data; return data; });
  const validator = { prepareNew: async (brandId, input) => {
    assert.equal(brandId, 'brand-a');
    assert.equal(input.whatsappTemplateId, 'template-a');
    return {
      template, parameterValues: { 'header.1': 'Asha', 'body.1': '7' },
      connectionVersion: current.connectionVersion,
    };
  } };
  await new CampaignService(validator).createCampaign('brand-a', {
    name: 'Welcome', channel: 'WHATSAPP', templateBody: 'client-cannot-override',
    whatsappTemplateId: 'template-a', whatsappTemplateLanguage: 'en_US',
    whatsappTemplateCategory: 'MARKETING',
    whatsappTemplateParameters: { 'header.1': 'Asha', 'body.1': '7' },
    scheduledAt: new Date('2026-09-22T00:00:00.000Z'),
  });
  assert.equal(created.templateBody, 'welcome');
  assert.equal(created.whatsappTemplateId, 'template-a');
  assert.equal(created.whatsappConnectionVersion, current.connectionVersion);
  assert.deepEqual(created.whatsappTemplateParameters, { 'header.1': 'Asha', 'body.1': '7' });
  assert.equal(created.status, 'QUEUED');
});

test('legacy draft cannot queue and a previously queued legacy campaign fails before recipient selection', async t => {
  const { CampaignService } = require('../dist/services/crm/campaign.service');
  const legacy = {
    id: 'legacy-campaign', brandId: 'brand-a', crmGeneration: 2, channel: 'WHATSAPP',
    status: 'DRAFT', attemptCount: 0, templateBody: 'legacy_name',
  };
  let writes = 0;
  void prisma.campaign.findFirst; void prisma.campaign.updateMany;
  t.mock.method(prisma.campaign, 'findFirst', async ({ where }) => {
    if (where.status === 'DRAFT') return { ...legacy };
    if (where.status === 'SENDING') return { ...legacy, status: 'SENDING', attemptCount: 1 };
    return null;
  });
  t.mock.method(prisma.campaign, 'updateMany', async ({ data }) => {
    writes++;
    if (data.status === 'SENDING') legacy.status = 'SENDING';
    if (data.status === 'FAILED') legacy.status = 'FAILED';
    return { count: 1 };
  });
  const validator = { validate: async () => {
    throw Object.assign(new Error('A verified WhatsApp template selection is required'), {
      code: 'WHATSAPP_TEMPLATE_SELECTION_REQUIRED',
    });
  } };
  const service = new CampaignService(validator);
  assert.equal(await service.queueDraft('brand-a', legacy.id), false);
  assert.equal(writes, 0);
  legacy.status = 'QUEUED';
  assert.equal(await service.sendCampaign(legacy.id, 'brand-a'), false);
  assert.equal(legacy.status, 'FAILED');
  assert.equal(writes, 2);
});

test('campaign verification migration is additive and does not rewrite or delete historical campaigns', () => {
  const migration = fs.readFileSync(path.join(
    __dirname, '../prisma/migrations/20260922000000_whatsapp_campaign_template_selection/migration.sql',
  ), 'utf8');
  assert.match(migration, /ADD COLUMN "whatsapp_template_id" TEXT/);
  assert.match(migration, /ADD COLUMN "whatsapp_connection_version" UUID/);
  assert.doesNotMatch(migration, /\b(?:DELETE|UPDATE|DROP)\b/i);
});
