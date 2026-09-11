const { test, beforeEach, after } = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { prisma, violations } = require('./support/isolation.cjs');
const { fixtures } = require('./support/fixtures.cjs');
const source=Boolean(require.extensions['.ts']);
if(source){const file=path.resolve(__dirname,'../src/lib/prisma.ts');require.cache[file]={id:file,filename:file,loaded:true,exports:{prisma}};}
const prefix=source?'../src':'../dist';
const { decimal }=require(`${prefix}/lib/money`);
const { LoyaltyService }=require(`${prefix}/services/crm/loyalty.service`);
const { CouponService }=require(`${prefix}/services/crm/coupon.service`);
const { ProfilerService }=require(`${prefix}/services/crm/profiler.service`);
const { ReportService }=require(`${prefix}/services/inventory/report.service`);
const { AnalyticsController }=require(`${prefix}/controllers/analytics.controller`);
const { financialAnalytics }=require(`${prefix}/services/analytics-detail.service`);
const { OrderService }=require(`${prefix}/services/order.service`);
const { RFMService }=require(`${prefix}/services/crm/rfm.service`);
const { DeductionQueueService }=require(`${prefix}/services/inventory/deduction-queue.service`);
let db,a;
beforeEach(()=>{db=fixtures();a=db.tenant(1);});
after(()=>assert.deepEqual(violations,[]));
test('Executive and financial reports use stored order discounts/GST and scope valid refunds',async()=>{
  prisma.order.aggregate=async q=>q._sum.totalAmount && !q._sum.subtotal?{_sum:{totalAmount:95}}:{_sum:{subtotal:100,taxAmount:5,totalAmount:95},_count:{id:1}};
  prisma.order.findMany=async()=>[{id:'o',taxAmount:5,invoice:{gst:999,discount:999}}];
  prisma.order.groupBy=async()=>[{status:'PAID',_count:{id:1}}];
  prisma.orderItem.aggregate=async()=>({_sum:{quantity:1}});
  prisma.payment.aggregate=async q=>{assert.equal(q.where.restaurantId,a.restaurant.id);assert.deepEqual(q.where.status.in,['SUCCESS','REFUNDED']);return {_sum:{refundedAmount:10}};};
  prisma.restaurantTable.count=async()=>1;
  prisma.customerRestaurantProfile.aggregate=async()=>({_avg:{ltv:0}});
  const res={status(n){this.statusCode=n;return this;},json(b){this.body=b;}};
  await new AnalyticsController().getExecutive({user:a.user,query:{startDate:'2026-09-01',endDate:'2026-09-01'}},res);
  assert.equal(res.statusCode??200,200);assert.equal(res.body.revenue.discounts,10);assert.equal(res.body.revenue.gst,5);assert.equal(res.body.revenue.net,85);
  prisma.expenses.groupBy=async()=>[];
  prisma.orderItem.groupBy=async q=>{
    assert.equal(q.where.order.restaurantId,a.restaurant.id);
    return [];
  };
  prisma.recipe.findMany=async q=>{
    assert.equal(q.where.menuItem.restaurantId,a.restaurant.id);
    return [];
  };
  prisma.orderItem.groupBy=async q=>{
    assert.equal(q.where.order.restaurantId,a.restaurant.id);
    return [];
  };
  prisma.recipe.findMany=async q=>{
    assert.equal(q.where.menuItem.restaurantId,a.restaurant.id);
    return [];
  };
  prisma.payment.groupBy=async q=>{assert.equal(q.where.paidAt,undefined);assert.ok(q.where.order.createdAt);return [{paymentMethod:'CASH',_sum:{amount:95,refundedAmount:10}}];};
  const report=await financialAnalytics(a.restaurant.id,{gte:new Date('2026-09-01'),lt:new Date('2026-09-02')});
  assert.equal(report.summary.net,85);assert.equal(report.paymentMethods.cash,85);
});
test('Inventory health counts out-of-stock once and empty inventory is unknown',async()=>{
  let rows=[{currentStock:0,minimumStockLevel:1,averageCost:decimal('0.1')},{currentStock:3,minimumStockLevel:1,averageCost:decimal('0.1')}];
  prisma.rawMaterial.findMany=async q=>{assert.equal(q.where.restaurantId,a.restaurant.id);return rows;};
  prisma.stockLedger.findMany=async()=>[];prisma.purchaseOrder.findMany=async()=>[];prisma.wastageRecord.aggregate=async()=>({_sum:{cost:0}});
  let result=await new ReportService().getDashboardMetrics(a.restaurant.id);
  assert.equal(result.totalValue,0.3);assert.equal(result.stockHealthScore,50);assert.equal(result.outOfStockItems,1);
  rows=[];result=await new ReportService().getDashboardMetrics(a.restaurant.id);assert.equal(result.totalValue,0);assert.equal(result.stockHealthScore,null);
});
test('Loyalty tier sums Decimal spend and restricts reads/writes to brand',async()=>{
  prisma.loyaltyTier.findMany=async()=>[{id:'tier',minSpend:decimal('0.3'),multiplier:2}];
  prisma.customerRestaurantProfile.findMany=async q=>{assert.deepEqual(q.where,{customerId:'c',restaurant:{brandId:'brand'}});return [{totalSpend:decimal('0.1')},{totalSpend:decimal('0.2')}];};
  prisma.customerRestaurantProfile.updateMany=async q=>{assert.equal(q.where.restaurant.brandId,'brand');return {count:2};};
  assert.equal((await new LoyaltyService().determineCustomerTierAndMultiplier('c','brand')).multiplier,2);
});
test('Concurrent loyalty redemptions cannot spend the same balance twice',async()=>{
  let balance=10,ledgers=0;
  prisma.loyaltyAccount.findUnique=async()=>({id:'account',pointsBalance:balance});
  prisma.loyaltyAccount.updateMany=async q=>{assert.equal(q.where.customerId,'c');if(balance<q.where.pointsBalance.gte)return {count:0};balance-=q.data.pointsBalance.decrement;return {count:1};};
  prisma.loyaltyLedger.create=async()=>{ledgers++;};
  const service=new LoyaltyService();
  const result=await Promise.allSettled([service.redeemPoints('c',10,'a',prisma),service.redeemPoints('c',10,'b',prisma)]);
  assert.equal(result.filter(r=>r.status==='fulfilled').length,1);assert.equal(balance,0);assert.equal(ledgers,1);
});
test('POS rejects fractional or excessive points without burning balance',async()=>{
  const id=db.id(90);db.data.orders.push({id,restaurantId:a.restaurant.id,status:'SERVED',customerId:'c',totalAmount:5});
  await assert.rejects(new OrderService().applyLoyaltyDiscount(id,a.restaurant.id,6),/exceed/);
  await assert.rejects(new OrderService().applyLoyaltyDiscount(id,a.restaurant.id,0.5),/greater/);
  prisma.loyaltyLedger.findFirst=async q=>{assert.equal(q.where.orderId,id);return {id:'existing-redemption'};};
  await assert.rejects(new OrderService().applyLoyaltyDiscount(id,a.restaurant.id,2),/already applied/);
});
test('Coupon claim is brand scoped, atomic and uses null until real order exists',async()=>{
  a.restaurant.brandId='brand';let claimed=false;
  prisma.customer.findFirst=async q=>{assert.equal(q.where.profiles.some.restaurantId,a.restaurant.id);return {brandId:'brand'};};
  prisma.coupon.findFirst=async q=>{assert.equal(q.where.brandId,'brand');return {id:'coupon',discountType:'FIXED',discountValue:10,minOrderAmount:0};};
  prisma.customerCoupon.findFirst=async()=>({id:'issued'});
  prisma.customerCoupon.updateMany=async q=>{assert.equal(q.data.orderId,null);assert.equal(q.where.isRedeemed,false);if(claimed)return {count:0};claimed=true;return {count:1};};
  const service=new CouponService();
  const result=await service.validateAndRedeem('c','SAVE',5,null,prisma,a.restaurant.id);
  assert.deepEqual(result,{discountAmount:5,issuanceId:'issued'});
  await assert.rejects(service.validateAndRedeem('c','SAVE',5,null,prisma,a.restaurant.id),/already redeemed/);
  prisma.customer.findFirst=async()=>({brandId:'foreign'});
  await assert.rejects(service.validateAndRedeem('c','SAVE',5,null,prisma,a.restaurant.id),/restaurant brand/);
});
test('Paid customer profile is rebuilt from tenant cash orders, net of refunds',async()=>{
  let locked=false,updated;
  prisma.customerRestaurantProfile.upsert=async q=>{assert.equal(q.where.customerId_restaurantId.restaurantId,a.restaurant.id);locked=true;};
  prisma.order.aggregate=async q=>{assert.ok(locked);assert.equal(q.where.restaurantId,a.restaurant.id);assert.equal(q.where.status,'PAID');assert.equal(q.where.payments.some.razorpayPaymentId,null);return {_sum:{totalAmount:30},_count:{id:2},_min:{createdAt:new Date('2026-09-01')},_max:{createdAt:new Date('2026-09-03')}};};
  prisma.payment.aggregate=async q=>{assert.equal(q.where.restaurantId,a.restaurant.id);return {_sum:{refundedAmount:5}};};
  prisma.customerRestaurantProfile.update=async q=>{updated=q.data;};
  await new ProfilerService().refreshPurchaseMetrics('c',a.restaurant.id,prisma);
  assert.equal(updated.totalSpend.toString(),'25');assert.equal(updated.aov.toString(),'12.5');assert.equal(updated.totalOrders,2);assert.equal(updated.visitFrequency,2);
});
test('Brand RFM includes all scoped outlets and the latest visit',async()=>{
  const now=new Date();
  prisma.customer.findMany=async q=>{assert.equal(q.where.brandId,'brand');assert.equal(q.include.profiles.where.restaurant.brandId,'brand');return [{id:'c',createdAt:now,profiles:[{lastVisit:new Date('2020-01-01'),totalOrders:2,totalSpend:decimal('0.1'),restaurant:{timezone:'UTC'}},{lastVisit:now,totalOrders:3,totalSpend:decimal('0.2'),restaurant:{timezone:'UTC'}}]}];};
  prisma.customer.update=async()=>{};
  const [result]=await new RFMService().calculateRFM('brand');
  assert.equal(result.frequency,5);assert.equal(result.monetary,0.3);assert.equal(result.recencyDays,0);
});
test('Inventory deduction uses serializable transaction to protect concurrent stock/ledger effects',async()=>{
  prisma.$transaction=async(fn,options)=>{assert.equal(options.isolationLevel,'Serializable');return fn(prisma);};
  prisma.order.findFirst=async q=>{assert.equal(q.where.restaurantId,a.restaurant.id);return {orderItems:[]};};
  prisma.auditLog.create=async()=>{};
  prisma.auditLog.deleteMany=async()=>({count:1});
  await DeductionQueueService.deductStockForOrder('order',a.restaurant.id);
});
test('Inventory deduction retries a serialization conflict without duplicating its business effect',async()=>{
  let attempts=0,successAudits=0;
  prisma.$transaction=async(fn,options)=>{
    attempts++;assert.equal(options.isolationLevel,'Serializable');
    if(attempts===1)throw Object.assign(new Error('private conflict detail'),{code:'40001'});
    return fn(prisma);
  };
  prisma.order.findFirst=async()=>({orderItems:[]});
  prisma.auditLog.create=async()=>{successAudits++;};
  prisma.auditLog.deleteMany=async()=>({count:1});
  await DeductionQueueService.deductStockForOrder('order',a.restaurant.id);
  assert.equal(attempts,2);assert.equal(successAudits,1);
});
