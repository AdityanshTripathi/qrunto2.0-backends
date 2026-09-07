# Money precision migration

Audited persisted prices, order lines/totals, discounts, GST, payments/refunds,
transactions, subscription/promo values, invoices, revenue/AOV/LTV, coupon limits,
supplier balances, inventory unit costs, purchase totals, wastage and expenses.
Thirty-eight money fields were Float. Twenty-three non-money Float fields remain:
tax/rate percentages, loyalty multipliers, predictions/scores, stock/recipe/transfer
quantities and stock variance. `tests/money-fields.json` is the reviewed field list.

Currency totals use `NUMERIC(15,2)`; unit costs, averages, percentage/promo values
and AOV/LTV use `NUMERIC(15,6)`. `src/lib/money.ts` uses isolated Decimal precision
40 and explicit ROUND_HALF_UP. Line totals round once to paise; subtotal sums rounded
lines; GST/percentage discounts round once; payable totals/refunds round after their
single operation. Inventory weighted averages round to six decimals. Persisted
Prisma Decimal values are converted back to exact JSON numbers at the HTTP boundary,
preserving existing frontend response types. Socket order totals are explicitly
numbers. No global Decimal settings are changed.

The migration is transactional, locks affected tables, casts float text to numeric,
and aborts before ALTER if any finite/range/scale check fails. It does not round,
rewrite, delete or insert data. This intentionally makes current data risk visible:
rows with extra meaningful decimals or out-of-range values require a reviewed data
decision before migration. The application must be deployed together with the
migration; Decimal code cannot safely run against Float-generated Prisma types.

Known deferrals: existing discount-before/after-GST policy is preserved; historical
inventory ledgers lack cost snapshots; refund timing lacks refundedAt; money remains
JSON number for compatibility; Float-to-Numeric cannot recover precision already
lost; payment verification/idempotency/webhooks remain deferred. Analytics outside
financial/inventory retain some number presentation math after Decimal inputs are
converted or accumulated safely. A future versioned API may emit decimal strings.

Review/apply later: take a production backup; run the read-only predicates from the
migration against a restored staging copy; investigate every failing table/column;
run `prisma migrate deploy` in staging during a write-maintenance window; compare
row counts, sums, min/max and sampled exact values before/after; deploy matching app,
run order/invoice/payment/refund/analytics smoke tests; then repeat backup, maintenance,
`prisma migrate deploy`, app deployment and verification in production. Do not use
`db push`, reset, force-reset, or edit failing data without separate approval.
