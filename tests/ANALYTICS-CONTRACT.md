# Inventory and financial analytics

## Frontend contract inventory

Only two callers were found: `Qrunto-Frontend/src/pages/dashboard/analytics/InventoryTab.tsx`
and `FinancialTab.tsx`. Both use GET (fetch default), `startDate` and `endDate`
as YYYY-MM-DD, and `Authorization: Bearer <access token>`. Their parent
`src/pages/dashboard/Analytics.tsx` passes `API_BASE_URL` from `config/backend.ts`;
`config/backend-url.ts` requires the configured URL to end in `/api`.

Exact final paths are `/api/analytics/inventory?startDate=YYYY-MM-DD&endDate=YYYY-MM-DD`
and `/api/analytics/financials?startDate=YYYY-MM-DD&endDate=YYYY-MM-DD`.
The server already mounted `/api/analytics`, but both controller methods were
missing from its router. Both new routes reuse the existing authenticate middleware
and derive restaurant ID exclusively from `req.user`, including DB-resolved tenant
identity. Query/body/signed tenant claims cannot override that identity. Missing
restaurant returns 400; missing/invalid auth returns 401.

Inventory renders `value.totalStockValue`, `value.wastageCost`, `lowStockCount`,
`deadStockCount`, each `consumption.{materialName,quantity,unit,cost}`, and matching
`turnover.{materialName,turnoverRatio}`. Added `materialId` distinguishes duplicate
names; the UI retains name fallback for older responses. Undefined turnover is
now null/N/A rather than fabricated 1.5x. `outOfStockCount` is an additive field.

Financials renders `summary.{gross,net,expenses,profit,gst,grossMargin}`,
`paymentMethods.{upi,cash,card}`, every `expenseBreakdown.{category,amount}`, and
`summary.net - summary.gst`. That last label now correctly says net sales excluding
GST. Added `paymentMethods.other` displays actual unknown/unclassified channels
instead of assigning them to card/UPI. Added summary orders/discounts/refunds are
available to callers without changing the existing rendered fields.

## Calculation rules

- All empty sums are actual zero, arrays empty. No sample materials, artificial
  valuation/wastage, default turnover, fabricated expenses or 70/20/10 payment split
  remain in these endpoints. Other analytics tabs were outside this task's scope.
- Dates are UTC calendar days, start inclusive and end exclusive at next midnight.
  Defaults retain a 30-day lookback through today. Invalid dates, repeated query
  keys and reversed ranges return 400 before any analytics queries.
- Inventory valuation/low/out-of-stock counts describe CURRENT ACTIVE materials,
  independently of report dates. Valuation is currentStock times averageCost;
  zero averageCost is valid and never replaced with purchasePrice.
- Period consumption groups negative SALE_DEDUCTION ledger quantities by material
  ID, retaining stock units already recorded by the deduction worker. Positive
  entries are not treated as consumption. Inactive materials' period consumption
  remains visible. Material and ledger tenant must both match. Consumption cost is
  an estimate at CURRENT costs; no historical ledger cost exists. This is not COGS.
- Wastage sums recorded cost by wasteDate and validates both material and record
  tenant. Turnover is period consumed quantity/current stock, rounded to 1 decimal;
  denominator <=0 returns null, not a fake ratio. Dead stock means active positive
  current stock with no sale deduction in the selected period, not an aging model.
- Financial order totals use SERVED/PAID and order.createdAt, following existing
  completed-order analytics rules. NEW/etc. and CANCELLED are excluded. Gross is
  subtotal+tax; net is stored order.totalAmount minus recorded refunds. Discount
  adjustment is gross minus stored totals; notes and invoice discount are never
  parsed/subtracted again. This preserves loyalty discounts without double counting.
- Refunds sum Payment.refundedAmount for SUCCESS/REFUNDED payments in that order
  cohort, scoped by BOTH payment and order tenant. No refundedAt field exists, so
  these are current recorded refunds on the selected orders, not refunds occurring
  during the range. No tax/refund allocation is invented.
- Payment splits use recorded amounts minus refunds for successful/refunded
  payments on the selected completed orders, additionally filtered by paidAt.
  Null/unknown methods go to other; pending/failed and unrelated payments are
  excluded. Splits may differ from order revenue (e.g. served/unpaid orders or
  payment outside the range). No reconciliation or fabricated allocation occurs.
- Expenses group stored amount by category and expense_date. Profit remains net
  minus recorded expenses; grossMargin retains the UI's profit/net convention.
  These include recorded GST and are operational totals, not statutory profit or
  net GST payable. The schema has no input-tax allocation or complete COGS data.
- Three inventory queries and four financial aggregates/groupings execute in
  parallel. No per-item queries, payment joins multiplying order totals, or full
  order/payment/ledger result loading. No new schema/index/migration was needed.

## Limits and verification

Existing Float money fields and current-cost valuation remain precision/history
risks; display totals round to two decimals without a broad Decimal migration.
Restaurant-specific timezone/business-day rules are deferred (no timezone field).
Historical/current report components can change as stock/refunds change. Concurrent
updates are not a transactional accounting snapshot. Duplicate payment records
cannot safely be deduplicated heuristically; payment idempotency remains deferred.

`npm run test:integration` includes real HTTP routing/auth and a dedicated realistic
Prisma-boundary fixture dataset, with tenant/date/relation filtering, empty data,
mutation sensitivity, split payments, refunds, zero costs and secret redaction.
No production data was used. These tests do NOT validate live PostgreSQL/RLS or
replace the existing real-infrastructure TODO. Production handlers query Prisma
only; fixture data is confined to tests.

After a separately approved deployment, use a dedicated tenant to load both tabs
for a known UTC date range, compare against that tenant's materials/ledger/wastage,
completed orders, successful/refunded payments and expenses. Check an empty range,
401 without auth, 400 invalid dates and unchanged results when forging restaurantId.
Verify duplicate-name materials, zero-stock N/A turnover, Other payments, and
requestId-correlated safe errors. Do not create/alter production payments to test.
