'use strict';
const { test, after } = require('node:test');
const assert = require('node:assert/strict');
const { prisma, violations } = require('./support/isolation.cjs');
const { PublicController } = require('../dist/controllers/public.controller');
const { CustomerRepository } = require('../dist/repositories/crm/customer.repository');
const { ConsentService } = require('../dist/services/crm/consent.service');
const { WhatsAppConnectionService } = require('../dist/services/crm/whatsapp-connection.service');

after(() => assert.equal(violations.length, 0));

test('CRM v2: loyalty balance stays private until the mobile is verified', async () => {
  let customerLookup = false;
  prisma.restaurant.findUnique = async () => ({ id: 'restaurant', brandId: 'brand' });
  prisma.customerPhoneVerification.findFirst = async () => null;
  prisma.customer.findFirst = async () => { customerLookup = true; throw new Error('Unexpected lookup'); };
  const response = { code: 200, body: null, status(code) { this.code = code; return this; }, json(body) { this.body = body; return this; } };
  await new PublicController().getLoyaltyBalance({ params: { slug: 'cafe' }, query: { phone: '9876543210' }, headers: {} }, response);
  assert.equal(response.code, 401);
  assert.equal(customerLookup, false);
});

test('CRM v2: guest directory requests are restricted to new profiles', async () => {
  prisma.customer.findMany = async query => {
    assert.equal(query.where.brandId, 'brand');
    assert.equal(query.where.crmGeneration, 2);
    return [];
  };
  await new CustomerRepository().findMany('brand');
});

test('CRM v2: latest opt-out blocks marketing regardless of earlier opt-in', async () => {
  prisma.customerConsent.findFirst = async query => {
    assert.deepEqual(query.where, { customerId: 'guest', channel: 'WHATSAPP', purpose: 'MARKETING' });
    assert.deepEqual(query.orderBy, [{ recordedAt: 'desc' }, { id: 'desc' }]);
    return { granted: false };
  };
  assert.equal(await new ConsentService().canSendWhatsAppMarketing('guest'), false);
});

test('CRM v2: brand WhatsApp token is encrypted at rest and never returned in status', async (t) => {
  prisma.brandWhatsAppConnection.create = async () => {};
  t.mock.method(prisma.brandWhatsAppConnection, 'create', async ({ data }) =>
    prisma.brandWhatsAppConnection.upsert({
      where: { brandId: data.brandId },
      create: data,
      update: data,
    }));
  process.env.CRM_CREDENTIAL_ENCRYPTION_KEY = 'ab'.repeat(32);
  let row;
  prisma.brandWhatsAppConnection.upsert = async ({ create }) => { row = create; return create; };
  prisma.brandWhatsAppConnection.findUnique = async () => row;
  const service = new WhatsAppConnectionService();
  await service.save('brand', '1234567890', 'long-test-access-token', 'en_US');
  assert.notEqual(row.encryptedAccessToken, 'long-test-access-token');
  assert.equal((await service.get('brand')).accessToken, 'long-test-access-token');
  const status = await service.status('brand');
  assert.equal(status.configured, true);
  assert.equal('accessToken' in status, false);
  delete process.env.CRM_CREDENTIAL_ENCRYPTION_KEY;
});
