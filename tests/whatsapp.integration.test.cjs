'use strict';
const { test, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const { WhatsAppService } = require('../dist/services/whatsapp.service');

const original = {
  phoneNumberId: process.env.WHATSAPP_PHONE_NUMBER_ID,
  accessToken: process.env.WHATSAPP_ACCESS_TOKEN,
};
afterEach(() => {
  if (original.phoneNumberId === undefined) delete process.env.WHATSAPP_PHONE_NUMBER_ID;
  else process.env.WHATSAPP_PHONE_NUMBER_ID = original.phoneNumberId;
  if (original.accessToken === undefined) delete process.env.WHATSAPP_ACCESS_TOKEN;
  else process.env.WHATSAPP_ACCESS_TOKEN = original.accessToken;
});

test('WhatsApp: missing provider configuration fails before network access', async t => {
  delete process.env.WHATSAPP_PHONE_NUMBER_ID; delete process.env.WHATSAPP_ACCESS_TOKEN;
  let calls=0; t.mock.method(global,'fetch',async()=>{calls++;});
  await assert.rejects(WhatsAppService.sendTextMessage('911234567890','test'),error=>error.code==='WHATSAPP_CONFIG_MISSING');
  assert.equal(calls,0);
});

test('WhatsApp: provider call has a timeout, no internal retry, and redacts provider failures', async t => {
  process.env.WHATSAPP_PHONE_NUMBER_ID='test-phone-id'; process.env.WHATSAPP_ACCESS_TOKEN='test-access-token';
  const privateValue='private-provider-error-and-token'; const errors=[]; let calls=0;
  t.mock.method(console,'error',row=>errors.push(row));
  t.mock.method(global,'fetch',async(_url,options)=>{
    calls++; assert.ok(options.signal instanceof AbortSignal);
    return { ok:false, status:503, json:async()=>({error:{message:privateValue}}) };
  });
  await assert.rejects(WhatsAppService.sendTemplateMessage('911234567890','test_template'),/provider rejected/);
  assert.equal(calls,1);assert.equal(JSON.stringify(errors).includes(privateValue),false);assert.equal(JSON.stringify(errors).includes('test-access-token'),false);
});
