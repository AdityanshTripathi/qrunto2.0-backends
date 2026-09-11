'use strict';
const { test, beforeEach, after } = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { prisma, violations } = require('./support/isolation.cjs');
const { fixtures } = require('./support/fixtures.cjs');
const source = Boolean(require.extensions['.ts']);
if (source) {
  const file = path.resolve(__dirname, '../src/lib/prisma.ts');
  require.cache[file] = { id: file, filename: file, loaded: true, exports: { prisma } };
}
const prefix = source ? '../src' : '../dist';
const { PublicController } = require(`${prefix}/controllers/public.controller`);
const { SubscriptionController } = require(`${prefix}/controllers/subscription.controller`);
const { OrderService } = require(`${prefix}/services/order.service`);
const { OrderController } = require(`${prefix}/controllers/order.controller`);
const { DeductionQueueService } = require(`${prefix}/services/inventory/deduction-queue.service`);
const { LoyaltyService } = require(`${prefix}/services/crm/loyalty.service`);
const { ProfilerService } = require(`${prefix}/services/crm/profiler.service`);
const service = new OrderService();
let db, a, b, order;
const response = () => ({ code: 200, status(n) { this.code=n; return this; }, json(body) { this.body=body; return this; } });
beforeEach(() => {
  db=fixtures(); a=db.tenant(1); b=db.tenant(2);
  order={id:db.id(90), restaurantId:a.restaurant.id, tableId:a.table.id, orderNumber:'ORD-TEST-90', status:'SERVED', subtotal:200, taxAmount:20.25, totalAmount:220.25, orderItems:[], customerId:null};
  db.data.orders.push(order);

  // Settlement now writes a durable inventory-recovery audit marker.
  prisma.auditLog.create = async ({ data }) => ({
    id: 'test-audit-log',
    ...data,
  });
});
after(() => assert.deepEqual(violations, []));

test('Payment simulators: production rejects forged success, references and amounts without DB writes', async () => {
  const env=process.env.NODE_ENV; process.env.NODE_ENV='production';
  try {
    const publicController = new PublicController();
    assert.equal(typeof publicController.markOrderPaidMock, 'undefined');

    for (let i=0;i<2;i++) {
      const req={params:{slug:a.restaurant.slug,orderId:order.id},user:a.user,body:{planId:db.id(9),amount:0,status:'SUCCESS',razorpayPaymentId:'forged',signature:'forged'}};
      const sub=response(); await new SubscriptionController().purchaseSubscription(req,sub); assert.equal(sub.code,503);
    }

    assert.equal(db.data.payments.length,0); assert.equal(db.data.transactions.length,0); assert.equal(order.status,'SERVED');
  } finally { process.env.NODE_ENV=env; }
});

test('Cash settlement: authenticated server amount, tenant ownership and sequential replay', async t => {
  t.mock.method(DeductionQueueService,'enqueueDeduction',async()=>{});
  const controller=new OrderController();
  const req={params:{id:order.id},user:a.user,body:{paymentMethod:'CASH',amount:0,status:'FAILED'},app:{get:()=>null}};
  const unauth=response(); await controller.payOrder({...req,user:undefined},unauth); assert.equal(unauth.code,401);
  const foreign=response(); await controller.payOrder({...req,user:b.user},foreign); assert.equal(foreign.code,400);
  for(let i=0;i<2;i++){const res=response();await controller.payOrder(req,res);assert.equal(res.code,200);}
  assert.equal(db.data.payments.length,1);assert.equal(db.data.transactions.length,1);
  assert.equal(db.data.payments[0].amount,220.25);assert.equal(db.data.payments[0].restaurantId,a.restaurant.id);
  assert.equal(db.data.transactions[0].paymentId,db.data.payments[0].id);
  assert.equal(db.data.invoices.length,1);

  const invoice=db.data.invoices[0];
  assert.equal(invoice.invoiceNumber,'INV-TEST-90');
  assert.equal(invoice.subtotal,200);
  assert.equal(invoice.gst,20.25);
  assert.equal(invoice.grandTotal,220.25);
  assert.equal(invoice.discount,0);
  assert.equal(invoice.paymentMethod,'CASH');
  assert.equal(invoice.paymentStatus,'SUCCESS');
  assert.equal(db.data.orders.find(row=>row.id===order.id).invoiceNumber,'INV-TEST-90');
});

test('Paid cash replay self-heals a missing invoice without charging twice', async t => {
  t.mock.method(DeductionQueueService,'enqueueDeduction',async()=>{});

  order.status='PAID';
  db.data.payments.push({
    id:db.id(91),
    orderId:order.id,
    restaurantId:a.restaurant.id,
    status:'SUCCESS',
    amount:220.25,
    refundedAmount:0,
    paymentMethod:'CASH',
    razorpayOrderId:null,
    razorpayPaymentId:null
  });

  assert.equal(db.data.invoices.length,0);

  await service.payOrder(order.id,a.restaurant.id,'CASH');
  await service.payOrder(order.id,a.restaurant.id,'CASH');

  assert.equal(db.data.payments.length,1);
  assert.equal(db.data.invoices.length,1);
  assert.equal(db.data.invoices[0].invoiceNumber,'INV-TEST-90');
  assert.equal(db.data.orders.find(row=>row.id===order.id).invoiceNumber,'INV-TEST-90');
});

test('Invoice retrieval requires authentication and is tenant scoped', async t => {
  t.mock.method(DeductionQueueService,'enqueueDeduction',async()=>{});

  await service.payOrder(order.id,a.restaurant.id,'CASH');

  const controller=new OrderController();

  const unauth=response();
  await controller.getInvoice({params:{id:order.id},user:undefined},unauth);
  assert.equal(unauth.code,401);

  const foreign=response();
  await controller.getInvoice({params:{id:order.id},user:b.user},foreign);
  assert.equal(foreign.code,404);

  const own=response();
  await controller.getInvoice({params:{id:order.id},user:a.user},own);
  assert.equal(own.code,200);
  assert.equal(own.body.invoice.restaurantId,a.restaurant.id);
  assert.equal(own.body.invoice.orderId,order.id);
  assert.equal(own.body.invoice.invoiceNumber,'INV-TEST-90');
});

test('Electronic confirmation and direct PAID transition are rejected', async () => {
  for(const method of ['UPI','CARD','ONLINE','SUCCESS',undefined]) await assert.rejects(service.payOrder(order.id,a.restaurant.id,method),/Only cash/);
  await assert.rejects(service.updateOrderStatus(order.id,a.restaurant.id,'PAID'),/settlement endpoint/);
  assert.equal(db.data.payments.length,0);
});

test('Concurrent cash requests contend on tenant/status/amount claim; effects happen once', async t => {
  t.mock.method(DeductionQueueService,'enqueueDeduction',async()=>{});
  order.customerId='customer'; a.restaurant.brandId='brand'; let earned=0;
  t.mock.method(ProfilerService.prototype,'refreshPurchaseMetrics',async()=>{});
  t.mock.method(LoyaltyService.prototype,'earnPoints',async()=>{earned++;});
  // Force both requests to read the same unpaid state before the conditional write.
  const find=prisma.order.findFirst; let reads=0,release;
  const gate=new Promise(resolve=>{release=resolve;});
  prisma.order.findFirst=async args=>{const result=await find(args); if(++reads<=2){if(reads===2)release();await gate;}return result;};
  const results=await Promise.all([service.payOrder(order.id,a.restaurant.id,'CASH'),service.payOrder(order.id,a.restaurant.id,'CASH')]);
  assert.ok(results.every(row=>row.status==='PAID'));
  assert.equal(db.data.payments.length,1);assert.equal(db.data.transactions.length,1);assert.equal(earned,1);
  const claims=db.queries.filter(q=>q.operation==='updateMany' && q.where.status==='SERVED' && q.where.totalAmount===220.25);
  assert.equal(claims.length,2);
  assert.ok(claims.every(q=>q.where.restaurantId===a.restaurant.id && q.where.status==='SERVED' && q.where.totalAmount===220.25));
});

test('Cash transaction rolls back when ledger fails, then retry creates one payment', async t => {
  t.mock.method(DeductionQueueService,'enqueueDeduction',async()=>{});
  const create=prisma.transaction.create;
  prisma.transaction.create=async()=>{throw Error('ledger unavailable');};
  await assert.rejects(service.payOrder(order.id,a.restaurant.id,'CASH'),/ledger unavailable/);
  assert.equal(db.data.orders[0].status,'SERVED');assert.equal(db.data.payments.length,0);
  prisma.transaction.create=create;
  await service.payOrder(order.id,a.restaurant.id,'CASH');
  assert.equal(db.data.payments.length,1);assert.equal(db.data.transactions.length,1);
});

test('Enqueue failure can be retried after payment commit without charging twice', async t => {
  let calls=0;
  t.mock.method(DeductionQueueService,'enqueueDeduction',async()=>{if(++calls===1)throw Error('queue unavailable');});
  await assert.rejects(service.payOrder(order.id,a.restaurant.id,'CASH'),/queue unavailable/);
  await service.payOrder(order.id,a.restaurant.id,'CASH');
  assert.equal(calls,2);assert.equal(db.data.payments.length,1);assert.equal(db.data.transactions.length,1);
});

test('Cancelled, refunded, partially refunded and mismatched paid orders cannot be charged again', async () => {
  order.status='CANCELLED';await assert.rejects(service.payOrder(order.id,a.restaurant.id,'CASH'),/cancelled/);
  order=db.data.orders[0]; order.status='PAID';
  for(const [status,amount,refundedAmount] of [['REFUNDED',220.25,220.25],['SUCCESS',220.25,10],['SUCCESS',220.25,999],['SUCCESS',1,0]]) {
    db.data.payments.splice(0,Infinity,{orderId:order.id,restaurantId:a.restaurant.id,status,amount,refundedAmount});
    for(let i=0;i<2;i++) await assert.rejects(service.payOrder(order.id,a.restaurant.id,'CASH'),/Refunded|reconciliation/);
    assert.equal(db.data.payments.length,1);assert.equal(db.data.transactions.length,0);
  }
});

test('Concurrent amount/status change cannot create a stale payment', async () => {
  prisma.order.updateMany=async()=>{order.totalAmount=300;return {count:0};};
  await assert.rejects(service.payOrder(order.id,a.restaurant.id,'CASH'),/Order changed/);
  assert.equal(db.data.payments.length,0);assert.equal(db.data.transactions.length,0);
});

test('Public payment status is scoped and does not show refunded or incomplete payments as paid', async () => {
  const find=prisma.order.findFirst;
  prisma.order.findFirst=async args=>{
    assert.equal(args.where.restaurantId,a.restaurant.id);
    assert.equal(args.include.payments.where.restaurantId,a.restaurant.id);
    assert.deepEqual(args.include.payments.where.status.in,['SUCCESS','REFUNDED']);
    const row=await find(args);
    return {...row,payments:row.payments.filter(p=>p.restaurantId===a.restaurant.id && ['SUCCESS','REFUNDED'].includes(p.status))};
  };
  order.status='PAID';
  const read=async()=>{const res=response();await new PublicController().getOrderStatus({params:{slug:a.restaurant.slug,orderId:order.id}},res);assert.equal(res.code,200);return res.body.order.paymentStatus;};
  assert.equal(await read(),'PENDING');
  db.data.payments.push({orderId:order.id,restaurantId:b.restaurant.id,status:'SUCCESS',amount:999});
  assert.equal(await read(),'PENDING');
  const payment={orderId:order.id,restaurantId:a.restaurant.id,status:'SUCCESS',amount:220.25,refundedAmount:0};db.data.payments.push(payment);
  assert.equal(await read(),'SUCCESS');
  payment.refundedAmount=10;assert.equal(await read(),'REFUNDED');
  payment.status='REFUNDED';payment.refundedAmount=220.25;assert.equal(await read(),'REFUNDED');
});
