'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const token = 'server-secret-token-that-must-never-escape';
const snapshot = {
  brandId: 'brand-a', wabaId: 'waba-a', connectionVersion: '11111111-1111-4111-8111-111111111111',
  accessToken: token,
};

function response(body, status = 200) {
  return { ok: status >= 200 && status < 300, status, json: async () => body };
}

function harness({ pages, current = true } = {}) {
  const commits = [];
  const failures = [];
  const calls = [];
  const connection = {
    getActiveTemplateSnapshot: async brandId => ({ ...snapshot, brandId }),
    markTemplatesSynced: async () => true,
    markNeedsReauth: async (...args) => { failures.push(['reauth', ...args]); return true; },
    recordSafeError: async (...args) => { failures.push(['error', ...args]); return true; },
  };
  const repository = {
    replaceSnapshot: async (value, templates) => {
      commits.push({ value, templates });
      return current;
    },
    list: async brandId => commits.flatMap(entry => entry.templates)
      .filter(row => row.brandId === brandId),
  };
  const fetchImpl = async (url, options) => {
    calls.push({ url: String(url), authorization: options.headers.Authorization });
    const page = pages.shift();
    if (page instanceof Error) throw page;
    return page;
  };
  return { connection, repository, fetchImpl, commits, failures, calls };
}

test('template sync follows safe paging, keeps language variants, derives schema, and skips invalid items', async () => {
  const { WhatsAppTemplateSyncService } = require('../dist/services/crm/whatsapp-template-sync.service');
  const h = harness({ pages: [
    response({ data: [
      { id: 'm-en', name: 'welcome', language: 'en_US', category: 'MARKETING', status: 'APPROVED', components: [
        { type: 'HEADER', format: 'TEXT', text: 'Hello {{1}}' },
        { type: 'BODY', text: 'Your table {{1}} is ready at {{2}}.' },
        { type: 'BUTTONS', buttons: [{ type: 'URL', text: 'Open', url: 'https://example.test/{{1}}' }] },
      ] },
      { name: 'missing-language', status: 'APPROVED', components: [] },
    ], paging: { next: 'https://graph.facebook.com/v26.0/waba-a/message_templates?after=cursor-2' } }),
    response({ data: [
      { id: 'm-hi', name: 'welcome', language: 'hi', category: 'MARKETING', status: 'REJECTED', components: [] },
    ] }),
  ] });
  const service = new WhatsAppTemplateSyncService(h.fetchImpl, h.connection, h.repository);
  const result = await service.sync('brand-a');
  assert.deepEqual(result, { synced: 2, skipped: 1 });
  assert.equal(h.commits.length, 1);
  assert.deepEqual(h.commits[0].templates.map(row => [row.templateName, row.languageCode, row.approvalStatus]), [
    ['welcome', 'en_US', 'APPROVED'], ['welcome', 'hi', 'REJECTED'],
  ]);
  assert.deepEqual(h.commits[0].templates[0].parameterSchema.parameters.map(value => value.name), [
    'header.1', 'body.1', 'body.2', 'button.0.1',
  ]);
  assert.ok(h.calls.every(call => call.authorization === `Bearer ${token}`));
  assert.ok(h.calls.every(call => !call.url.includes(token)));
});

test('template sync rejects unsafe or looping paging links without leaking credentials', async () => {
  const { WhatsAppTemplateSyncService, WhatsAppTemplateSyncError } = require('../dist/services/crm/whatsapp-template-sync.service');
  for (const next of [
    'https://evil.example/v26.0/waba-a/message_templates?access_token=' + token,
    'https://graph.facebook.com/v26.0/waba-a/message_templates?after=same',
  ]) {
    const h = harness({ pages: [response({ data: [], paging: { next } }), response({ data: [], paging: { next } })] });
    const service = new WhatsAppTemplateSyncService(h.fetchImpl, h.connection, h.repository);
    await assert.rejects(service.sync('brand-a'), error => {
      assert.ok(error instanceof WhatsAppTemplateSyncError);
      assert.equal(JSON.stringify(error).includes(token), false);
      return error.code === 'META_TEMPLATE_RESPONSE_INVALID';
    });
    assert.equal(h.commits.length, 0);
  }
});

test('template sync stops stale connection work before cache mutation', async () => {
  const { WhatsAppTemplateSyncService } = require('../dist/services/crm/whatsapp-template-sync.service');
  const h = harness({ current: false, pages: [response({ data: [
    { id: 'm1', name: 'safe', language: 'en_US', category: 'UTILITY', status: 'APPROVED', components: [] },
  ] })] });
  await assert.rejects(new WhatsAppTemplateSyncService(h.fetchImpl, h.connection, h.repository).sync('brand-a'),
    error => error.code === 'WHATSAPP_CONNECTION_ROTATED');
  assert.equal(h.commits.length, 1);
});

test('template sync classifies provider auth and generic failures with safe connection methods', async () => {
  const { WhatsAppTemplateSyncService } = require('../dist/services/crm/whatsapp-template-sync.service');
  for (const [status, body, expected] of [
    [401, { error: { message: token, code: 190 } }, 'META_AUTHENTICATION_FAILED'],
    [500, { error: { message: token, code: 2 } }, 'META_TEMPLATE_SYNC_FAILED'],
  ]) {
    const h = harness({ pages: [response(body, status)] });
    await assert.rejects(new WhatsAppTemplateSyncService(h.fetchImpl, h.connection, h.repository).sync('brand-a'), error => {
      assert.equal(error.code, expected);
      assert.equal(error.message.includes(token), false);
      return true;
    });
    assert.equal(JSON.stringify(h.failures).includes(token), false);
    assert.equal(h.commits.length, 0);
  }
});

test('template sync enforces a finite pagination limit', async () => {
  const { WhatsAppTemplateSyncService } = require('../dist/services/crm/whatsapp-template-sync.service');
  const pages = Array.from({ length: 20 }, (_, index) => response({
    data: [], paging: { next: `https://graph.facebook.com/v26.0/waba-a/message_templates?after=${index + 1}` },
  }));
  const h = harness({ pages });
  await assert.rejects(new WhatsAppTemplateSyncService(h.fetchImpl, h.connection, h.repository).sync('brand-a'),
    error => error.code === 'META_TEMPLATE_RESPONSE_INVALID');
  assert.equal(h.calls.length, 20);
  assert.equal(h.commits.length, 0);
});

test('eligible cache listing excludes rejected, removed, stale WABA, and other brands', async () => {
  const { filterEligibleTemplates } = require('../dist/services/crm/whatsapp-template-sync.service');
  const rows = [
    { id: 'ok', brandId: 'brand-a', wabaId: 'waba-a', approvalStatus: 'APPROVED', category: 'MARKETING', parameterSchema: { version: 1, parameters: [] } },
    { id: 'rejected', brandId: 'brand-a', wabaId: 'waba-a', approvalStatus: 'REJECTED', category: 'MARKETING', parameterSchema: { version: 1, parameters: [] } },
    { id: 'removed', brandId: 'brand-a', wabaId: 'waba-a', approvalStatus: 'SYNC_REMOVED', category: 'MARKETING', parameterSchema: { version: 1, parameters: [] } },
    { id: 'stale', brandId: 'brand-a', wabaId: 'waba-old', approvalStatus: 'APPROVED', category: 'MARKETING', parameterSchema: { version: 1, parameters: [] } },
    { id: 'foreign', brandId: 'brand-b', wabaId: 'waba-a', approvalStatus: 'APPROVED', category: 'MARKETING', parameterSchema: { version: 1, parameters: [] } },
  ];
  assert.deepEqual(filterEligibleTemplates(rows, 'brand-a', 'waba-a').map(row => row.id), ['ok']);
});

test('template cache mutation locks and checks the connection identity before writes', () => {
  const source = fs.readFileSync(path.join(__dirname, '../src/services/crm/whatsapp-template-sync.service.ts'), 'utf8');
  assert.match(source, /connection_version[\s\S]*FOR UPDATE/);
  assert.match(source, /approvalStatus: 'SYNC_REMOVED'/);
});

test('CRM v2 exposes authenticated, rate-limited sync and sanitized cache routes', () => {
  const source = fs.readFileSync(path.join(__dirname, '../src/routes/crm/v2.routes.ts'), 'utf8');
  assert.match(source, /router\.use\(authenticate, requireRoles\([^\n]+requireRestaurantContext\)/);
  assert.match(source, /router\.post\('\/whatsapp\/templates\/sync', whatsappSignupRateLimiter/);
  assert.match(source, /router\.get\('\/whatsapp\/templates'/);
  assert.match(source, /router\.get\('\/whatsapp\/templates\/eligible'/);
  const sanitizer = source.slice(source.indexOf('function publicTemplate'), source.indexOf('function templateErrorResponse'));
  assert.doesNotMatch(sanitizer, /wabaId|componentsJson|accessToken|connectionVersion/);
});
