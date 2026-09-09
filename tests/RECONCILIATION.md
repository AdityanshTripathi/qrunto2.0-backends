# Phase 5.6 production checks (manual, read-only first)

No production data was inspected or changed. The repository proves historical
simulator paths existed; it does not prove which production rows are affected.
Run these queries in an approved SQL session with a backup available:

```sql
BEGIN READ ONLY;
-- Suspected simulator receipts: verify individually against actual cash records.
SELECT id, restaurant_id, order_id, amount, status, payment_method
FROM payments
WHERE razorpay_order_id LIKE 'order_mock_%'
   OR razorpay_payment_id LIKE 'pay_mock_%'
   OR payment_method = 'ONLINE_DEMO';

-- Duplicate, invalid, refunded or mismatched cash settlements.
SELECT o.id, o.restaurant_id, o.status, o.total_amount,
       count(p.id) AS receipts, sum(p.amount) AS received,
       sum(p.refunded_amount) AS refunded
FROM orders o LEFT JOIN payments p
  ON p.order_id = o.id AND p.restaurant_id = o.restaurant_id
 AND p.status IN ('SUCCESS', 'REFUNDED')
GROUP BY o.id
HAVING count(p.id) > 1
 OR (o.status = 'PAID' AND (count(p.id) <> 1 OR sum(p.amount) <> o.total_amount))
 OR (o.status = 'CANCELLED' AND count(p.id) > 0)
 OR sum(p.refunded_amount) > 0;

SELECT id FROM payments
WHERE amount < 0 OR refunded_amount < 0 OR refunded_amount > amount;
SELECT p.id FROM payments p JOIN orders o ON o.id = p.order_id
WHERE p.restaurant_id <> o.restaurant_id;

-- Line/subtotal mismatch or impossible discount. Taxes remain stored order values.
SELECT o.id, o.restaurant_id FROM orders o
LEFT JOIN order_items i ON i.order_id = o.id
GROUP BY o.id
HAVING o.subtotal <> coalesce(sum(i.total_price), 0)
 OR o.total_amount < 0 OR o.total_amount > o.subtotal + o.tax_amount;

-- This prefix also may include legitimate licenses: do not bulk-revoke.
SELECT id, code, usage_count, usage_limit FROM promo_codes
WHERE code LIKE 'QR-%' OR usage_count > usage_limit;
ROLLBACK;
```

For each suspect payment/license, match counter receipts, promo redemptions,
subscription dates, transactions and loyalty entries by tenant and time. Obtain
explicit approval for a per-record correction plan; do not run the old customer
backfill blindly. Recompute affected profile spend/orders/AOV/visits from valid
cash orders and recorded refunds after reconciliation. Untouched historical
profiles remain stale until reviewed; new cash settlements refresh their profile.

After deployment, in a dedicated test restaurant:

1. Place an order with fractional prices, GST and one coupon/loyalty discount.
   Compare line totals, stored subtotal/GST/total and both invoice previews;
   change current tax settings and confirm the invoice retains stored GST.
2. Settle CASH twice and concurrently: one receipt/transaction, one loyalty earn
   and one inventory deduction. Reject CARD/UPI, simulator purchase and cancelled
   settlement. Verify a duplicate loyalty/coupon request cannot discount twice.
3. Append an item while settling: either the append or settlement must fail cleanly;
   successful receipt and final order total must agree. Refresh the open invoice.
4. Compare executive net/discount/GST with financials for the same tenant-local
   dates. Payment splits use the order cohort even when cash was received later.
   SERVED sales are accrual sales, not cash received; unpaid sales can explain a gap.
5. Compare active stock quantity × average cost with both inventory reports.
   Historical consumption uses current average cost because no cost snapshot exists.
6. Verify profile spend/AOV, latest visit, brand-wide RFM and loyalty tier after
   cash settlement. Check another tenant cannot access or redeem these records.

Deferred: real PostgreSQL concurrency/RLS validation, crash-atomic payment-to-queue
handoff, historical cost/tax/refund allocation, and actual production anomalies.
There is no refund mutation API; existing refunded records require manual review.
