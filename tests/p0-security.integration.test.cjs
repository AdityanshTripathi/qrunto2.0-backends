'use strict';
require('./support/isolation.cjs');
const { test, after } = require('node:test');
const assert = require('node:assert/strict');
const jwt = require('jsonwebtoken');
const { prisma, violations } = require('./support/isolation.cjs');
const { FeedbackService } = require('../dist/services/crm/feedback.service');
const { PurchaseRepository } = require('../dist/repositories/inventory/purchase.repository');
const { PublicController } = require('../dist/controllers/public.controller');

const id = n => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;

after(() => assert.equal(violations.length, 0, 'No external connections or unconfigured DB operations'));

test('P0 #1: complaint tickets cannot be listed or updated across brands', async () => {
  const brandA = id(1);
  const brandB = id(2);
  const ownTicket = { id: id(11), brandId: brandA, status: 'OPEN' };
  const foreignTicket = { id: id(12), brandId: brandB, status: 'OPEN' };
  const foreignAssignee = id(13);
  const tickets = [ownTicket, foreignTicket];
  let updates = 0;

  prisma.complaintTicket.findMany = async ({ where }) => tickets.filter(ticket => ticket.brandId === where.brandId);
  prisma.complaintTicket.findFirst = async ({ where }) =>
    tickets.find(ticket => ticket.id === where.id && ticket.brandId === where.brandId) ?? null;
  prisma.complaintTicket.update = async ({ where, data }) => {
    updates++;
    const ticket = tickets.find(candidate => candidate.id === where.id && candidate.brandId === where.brandId);
    if (!ticket) throw new Error('Fixture ticket missing');
    Object.assign(ticket, data);
    return structuredClone(ticket);
  };
  prisma.restaurant.findMany = async () => [{ id: id(14) }];
  prisma.user.findFirst = async ({ where }) => where.id === foreignAssignee ? null : { id: where.id };

  const service = new FeedbackService();
  assert.deepEqual(await service.getTickets(brandA), [ownTicket]);
  await assert.rejects(
    service.updateTicketStatus(brandA, foreignTicket.id, 'RESOLVED'),
    /Complaint ticket not found/,
  );
  assert.equal(updates, 0);

  await assert.rejects(
    service.updateTicketStatus(brandA, ownTicket.id, 'IN_PROGRESS', foreignAssignee),
    /Assignee not found or unauthorized/,
  );
  assert.equal(updates, 0);

  const updated = await service.updateTicketStatus(brandA, ownTicket.id, 'RESOLVED');
  assert.equal(updated.status, 'RESOLVED');
  assert.equal(updates, 1);
});

test('P0 #2: purchase create and item replacement reject another restaurant rawMaterialId before writing', async () => {
  const restaurantA = id(21);
  const ownMaterial = id(22);
  const foreignMaterial = id(23);
  const purchaseOrderId = id(24);
  let creates = 0;
  let itemDeletes = 0;

  prisma.rawMaterial.count = async ({ where }) =>
    [ownMaterial].filter(materialId => where.id.in.includes(materialId) && where.restaurantId === restaurantA).length;
  prisma.purchaseOrder.create = async ({ data }) => {
    creates++;
    return { id: purchaseOrderId, ...data };
  };
  prisma.purchaseOrder.findFirst = async ({ where }) =>
    where.id === purchaseOrderId && where.restaurantId === restaurantA ? { id: purchaseOrderId, status: 'DRAFT' } : null;
  prisma.purchaseOrderItem.deleteMany = async () => { itemDeletes++; return { count: 1 }; };
  prisma.purchaseOrder.update = async () => ({ id: purchaseOrderId });
  prisma.purchaseOrder.findUnique = async () => ({ id: purchaseOrderId });
  prisma.$transaction = async callback => callback(prisma);

  const repository = new PurchaseRepository();
  const purchase = materials => ({
    supplierId: id(25),
    poNumber: 'PO-SECURITY',
    subtotal: 10,
    gstAmount: 0,
    grandTotal: 10,
    items: materials.map(rawMaterialId => ({ rawMaterialId, quantity: 1, unitPrice: 10, totalCost: 10 })),
  });

  await assert.rejects(
    repository.create(restaurantA, purchase([ownMaterial, foreignMaterial])),
    /raw materials not found or unauthorized/,
  );
  assert.equal(creates, 0);

  await assert.rejects(
    repository.update(purchaseOrderId, restaurantA, { items: purchase([foreignMaterial]).items }),
    /raw materials not found or unauthorized/,
  );
  assert.equal(itemDeletes, 0);

  await repository.create(restaurantA, purchase([ownMaterial]));
  assert.equal(creates, 1);
});

test('P0 #3: public checkout rejects unauthenticated loyalty points and customer coupons', async () => {
  const controller = new PublicController();
  const restaurant = { id: id(31), slug: 'secure-restaurant', isActive: true, settings: { taxPercentage: 0 } };
  let restaurantLookups = 0;
  prisma.restaurant.findUnique = async ({ where }) => {
    restaurantLookups++;
    return where.slug === restaurant.slug ? restaurant : null;
  };

  const invoke = async reward => {
    const response = { statusCode: 200, body: undefined };
    const res = {
      status(code) { response.statusCode = code; return this; },
      json(body) { response.body = body; return this; },
    };
    await controller.placeOrder({
      params: { slug: restaurant.slug },
      body: {
        tableNumber: '1',
        items: [{ menuItemId: id(32), quantity: 1 }],
        customerPhone: '9999999999',
        ...reward,
      },
      headers: {},
    }, res);
    return response;
  };

  for (const reward of [{ redeemPoints: 1 }, { couponCode: 'CUSTOMER-ONLY' }]) {
    const response = await invoke(reward);
    assert.equal(response.statusCode, 401);
    assert.match(response.body.error, /authorization is required/i);
  }
  assert.equal(restaurantLookups, 2);
});

test('P0 #3: a token for another restaurant cannot authorize public reward redemption', async () => {
  const controller = new PublicController();
  const restaurant = { id: id(41), slug: 'target-restaurant', isActive: true, settings: { taxPercentage: 0 } };
  const actor = { id: id(42), email: 'owner@example.test', role: 'RESTAURANT_OWNER', restaurantId: id(43), isActive: true };
  prisma.restaurant.findUnique = async ({ where }) => where.slug === restaurant.slug ? restaurant : null;
  prisma.restaurant.findFirst = async ({ where }) => where.id === actor.restaurantId ? { id: actor.restaurantId } : null;
  prisma.user.findUnique = async ({ where }) => where.id === actor.id ? { ...actor, restaurants: [] } : null;

  const response = { statusCode: 200, body: undefined };
  const res = {
    status(code) { response.statusCode = code; return this; },
    json(body) { response.body = body; return this; },
  };
  await controller.placeOrder({
    params: { slug: restaurant.slug },
    body: {
      tableNumber: '1',
      items: [{ menuItemId: id(44), quantity: 1 }],
      customerPhone: '9999999999',
      redeemPoints: 1,
    },
    headers: { authorization: `Bearer ${jwt.sign({ id: actor.id }, process.env.JWT_SECRET)}` },
  }, res);

  assert.equal(response.statusCode, 403);
  assert.match(response.body.error, /not authorized/i);
});
