'use strict';

const assert = require('node:assert/strict');
const { randomUUID } = require('node:crypto');
const test = require('node:test');

// This import validates ORDIO_LOCAL_TEST_DATABASE_URL before loading Prisma or the service.
const { prisma, pool } = require('./support/local-ordio-dev.cjs');
const { WhatsAppConnectionService } = require('../dist/services/crm/whatsapp-connection.service');

const runId = randomUUID();
const fixture = {
  brandAId: randomUUID(),
  brandBId: randomUUID(),
  customerId: randomUUID(),
  campaignId: randomUUID(),
  campaignLogId: randomUUID(),
  phoneA: `local-phone-a-${runId}`,
  phoneB: `local-phone-b-${runId}`,
};

async function cleanup() {
  await prisma.campaignLog.deleteMany({ where: { id: fixture.campaignLogId } });
  await prisma.campaign.deleteMany({ where: { id: fixture.campaignId } });
  await prisma.customer.deleteMany({ where: { id: fixture.customerId } });
  await prisma.brandWhatsAppConnection.deleteMany({
    where: { brandId: { in: [fixture.brandAId, fixture.brandBId] } },
  });
  await prisma.brand.deleteMany({ where: { id: { in: [fixture.brandAId, fixture.brandBId] } } });
}

test('WhatsApp connection service persists and protects local ordio_dev records', async (t) => {
  const service = new WhatsAppConnectionService();

  try {
    await prisma.brand.createMany({
      data: [
        { id: fixture.brandAId, name: `Local WhatsApp A ${runId}` },
        { id: fixture.brandBId, name: `Local WhatsApp B ${runId}` },
      ],
    });
    await prisma.customer.create({
      data: {
        id: fixture.customerId,
        brandId: fixture.brandAId,
        name: 'Local WhatsApp Test Customer',
        phone: `local-customer-${runId}`,
      },
    });
    await prisma.campaign.create({
      data: {
        id: fixture.campaignId,
        brandId: fixture.brandAId,
        name: `Local WhatsApp Campaign ${runId}`,
        channel: 'WHATSAPP',
        templateBody: 'Local connection test fixture',
        scheduledAt: new Date('2030-01-01T00:00:00.000Z'),
      },
    });
    await prisma.campaignLog.create({
      data: { id: fixture.campaignLogId, campaignId: fixture.campaignId, customerId: fixture.customerId },
    });

    await t.test('persists legacy manual credentials and returns a credential-safe public status', async () => {
      const initialToken = `local-test-token-${runId}-initial`;
      await service.save(fixture.brandAId, fixture.phoneA, initialToken, 'en_US');

      const stored = await prisma.brandWhatsAppConnection.findUniqueOrThrow({ where: { brandId: fixture.brandAId } });
      assert.equal(stored.source, 'MANUAL');
      assert.equal(stored.status, 'LEGACY_CONNECTED');
      assert.notEqual(stored.encryptedAccessToken, initialToken);
      assert.match(stored.connectionVersion, /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i);
      assert.equal((await service.get(fixture.brandAId)).accessToken, initialToken);

      const status = await service.status(fixture.brandAId);
      assert.equal(status.status, 'LEGACY_CONNECTED');
      assert.equal(status.source, 'MANUAL');
      assert.equal(Object.hasOwn(status, 'accessToken'), false);
      assert.equal(Object.hasOwn(status, 'encryptedAccessToken'), false);
      assert.equal(Object.hasOwn(status, 'connectionVersion'), false);
    });

    await t.test('rotates same-phone credentials, rejects stale operations, and isolates brands', async () => {
      const beforeRotation = await prisma.brandWhatsAppConnection.findUniqueOrThrow({ where: { brandId: fixture.brandAId } });
      const rotatedToken = `local-test-token-${runId}-rotated`;
      await service.save(fixture.brandAId, fixture.phoneA, rotatedToken, 'en_US');

      const rotated = await prisma.brandWhatsAppConnection.findUniqueOrThrow({ where: { brandId: fixture.brandAId } });
      assert.equal(rotated.phoneNumberId, fixture.phoneA);
      assert.notEqual(rotated.connectionVersion, beforeRotation.connectionVersion);
      assert.notEqual(rotated.encryptedAccessToken, beforeRotation.encryptedAccessToken);
      assert.equal((await service.get(fixture.brandAId)).accessToken, rotatedToken);

      assert.equal(await service.markNeedsReauth(fixture.brandAId, { connectionVersion: beforeRotation.connectionVersion }), false);
      assert.equal(await service.markNeedsReauth(fixture.brandBId, { connectionVersion: rotated.connectionVersion }), false);
      const unchanged = await prisma.brandWhatsAppConnection.findUniqueOrThrow({ where: { brandId: fixture.brandAId } });
      assert.equal(unchanged.connectionVersion, rotated.connectionVersion);
      assert.equal(unchanged.status, 'LEGACY_CONNECTED');
      assert.equal(unchanged.lastErrorCode, null);

      await service.save(fixture.brandBId, fixture.phoneB, `local-test-token-${runId}-brand-b`, 'en_US');
      const brandBBeforeConflict = await prisma.brandWhatsAppConnection.findUniqueOrThrow({ where: { brandId: fixture.brandBId } });
      await assert.rejects(
        service.save(fixture.brandBId, fixture.phoneA, `local-test-token-${runId}-duplicate`, 'en_US'),
        (error) => error && error.code === 'P2002',
      );
      const brandBAfterConflict = await prisma.brandWhatsAppConnection.findUniqueOrThrow({ where: { brandId: fixture.brandBId } });
      assert.equal(brandBAfterConflict.connectionVersion, brandBBeforeConflict.connectionVersion);
      assert.equal(brandBAfterConflict.encryptedAccessToken, brandBBeforeConflict.encryptedAccessToken);
    });

    await t.test('verified reconnect is fresh and a failed persistence preserves the existing connection', async () => {
      const beforeReconnect = await prisma.brandWhatsAppConnection.findUniqueOrThrow({ where: { brandId: fixture.brandAId } });
      const verifiedToken = `local-test-token-${runId}-verified`;
      await service.saveVerifiedEmbeddedSignupConnection(fixture.brandAId, {
        phoneNumberId: fixture.phoneA,
        accessToken: verifiedToken,
        languageCode: 'en_US',
        wabaId: `local-waba-${runId}`,
      });

      const reconnected = await prisma.brandWhatsAppConnection.findUniqueOrThrow({ where: { brandId: fixture.brandAId } });
      assert.equal(reconnected.source, 'EMBEDDED_SIGNUP');
      assert.equal(reconnected.status, 'CONNECTED');
      assert.notEqual(reconnected.connectionVersion, beforeReconnect.connectionVersion);
      assert.equal((await service.get(fixture.brandAId)).accessToken, verifiedToken);
      assert.equal(await service.markValidated(fixture.brandAId, { connectionVersion: beforeReconnect.connectionVersion }), false);

      await assert.rejects(
        service.saveVerifiedEmbeddedSignupConnection(fixture.brandAId, {
          phoneNumberId: fixture.phoneB,
          accessToken: `local-test-token-${runId}-failed-reconnect`,
          languageCode: 'en_US',
          wabaId: `local-waba-failed-${runId}`,
        }),
        (error) => error && error.code === 'P2002',
      );
      const afterFailure = await prisma.brandWhatsAppConnection.findUniqueOrThrow({ where: { brandId: fixture.brandAId } });
      assert.equal(afterFailure.connectionVersion, reconnected.connectionVersion);
      assert.equal(afterFailure.encryptedAccessToken, reconnected.encryptedAccessToken);
      assert.equal((await service.get(fixture.brandAId)).accessToken, verifiedToken);
    });

    await t.test('disconnect deletes only a matching connection and preserves campaign history fixtures', async () => {
      const connection = await prisma.brandWhatsAppConnection.findUniqueOrThrow({ where: { brandId: fixture.brandAId } });
      assert.equal(await service.disconnect(fixture.brandAId, { connectionVersion: randomUUID() }), false);
      assert.ok(await prisma.brandWhatsAppConnection.findUnique({ where: { brandId: fixture.brandAId } }));
      assert.equal(await service.disconnect(fixture.brandBId, { connectionVersion: connection.connectionVersion }), false);
      assert.ok(await prisma.brandWhatsAppConnection.findUnique({ where: { brandId: fixture.brandBId } }));

      assert.equal(await service.disconnect(fixture.brandAId, { connectionVersion: connection.connectionVersion }), true);
      assert.equal(await prisma.brandWhatsAppConnection.findUnique({ where: { brandId: fixture.brandAId } }), null);
      assert.ok(await prisma.campaign.findUnique({ where: { id: fixture.campaignId } }));
      assert.ok(await prisma.campaignLog.findUnique({ where: { id: fixture.campaignLogId } }));
    });
  } finally {
    try {
      await cleanup();
    } finally {
      await pool.end();
    }
  }
});
