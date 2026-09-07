-- Review-only until ALL Decimal application checks pass. No data truncation is allowed.
BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '5min';
LOCK TABLE "subscription_plans", "promo_codes", "menu_items", "orders", "order_items", "payments", "transactions", "invoices", "analytics_snapshots", "customer_restaurant_profiles", "loyalty_tiers", "coupons", "suppliers", "raw_materials", "stock_batches", "purchase_orders", "purchase_order_items", "wastage_records", "expenses" IN ACCESS EXCLUSIVE MODE;
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM "subscription_plans" WHERE "price" IS NOT NULL AND ("price"::text IN ('NaN','Infinity','-Infinity') OR abs("price"::text::numeric) >= power(10::numeric, 13) OR "price"::text::numeric <> round("price"::text::numeric, 2))) THEN
    RAISE EXCEPTION 'Money preflight failed: subscription_plans.price; inspect precision/range before migration';
  END IF;
  IF EXISTS (SELECT 1 FROM "subscription_plans" WHERE "price_6_month" IS NOT NULL AND ("price_6_month"::text IN ('NaN','Infinity','-Infinity') OR abs("price_6_month"::text::numeric) >= power(10::numeric, 13) OR "price_6_month"::text::numeric <> round("price_6_month"::text::numeric, 2))) THEN
    RAISE EXCEPTION 'Money preflight failed: subscription_plans.price_6_month; inspect precision/range before migration';
  END IF;
  IF EXISTS (SELECT 1 FROM "subscription_plans" WHERE "price_1_year" IS NOT NULL AND ("price_1_year"::text IN ('NaN','Infinity','-Infinity') OR abs("price_1_year"::text::numeric) >= power(10::numeric, 13) OR "price_1_year"::text::numeric <> round("price_1_year"::text::numeric, 2))) THEN
    RAISE EXCEPTION 'Money preflight failed: subscription_plans.price_1_year; inspect precision/range before migration';
  END IF;
  IF EXISTS (SELECT 1 FROM "promo_codes" WHERE "value" IS NOT NULL AND ("value"::text IN ('NaN','Infinity','-Infinity') OR abs("value"::text::numeric) >= power(10::numeric, 9) OR "value"::text::numeric <> round("value"::text::numeric, 6))) THEN
    RAISE EXCEPTION 'Money preflight failed: promo_codes.value; inspect precision/range before migration';
  END IF;
  IF EXISTS (SELECT 1 FROM "menu_items" WHERE "price" IS NOT NULL AND ("price"::text IN ('NaN','Infinity','-Infinity') OR abs("price"::text::numeric) >= power(10::numeric, 13) OR "price"::text::numeric <> round("price"::text::numeric, 2))) THEN
    RAISE EXCEPTION 'Money preflight failed: menu_items.price; inspect precision/range before migration';
  END IF;
  IF EXISTS (SELECT 1 FROM "orders" WHERE "subtotal" IS NOT NULL AND ("subtotal"::text IN ('NaN','Infinity','-Infinity') OR abs("subtotal"::text::numeric) >= power(10::numeric, 13) OR "subtotal"::text::numeric <> round("subtotal"::text::numeric, 2))) THEN
    RAISE EXCEPTION 'Money preflight failed: orders.subtotal; inspect precision/range before migration';
  END IF;
  IF EXISTS (SELECT 1 FROM "orders" WHERE "tax_amount" IS NOT NULL AND ("tax_amount"::text IN ('NaN','Infinity','-Infinity') OR abs("tax_amount"::text::numeric) >= power(10::numeric, 13) OR "tax_amount"::text::numeric <> round("tax_amount"::text::numeric, 2))) THEN
    RAISE EXCEPTION 'Money preflight failed: orders.tax_amount; inspect precision/range before migration';
  END IF;
  IF EXISTS (SELECT 1 FROM "orders" WHERE "total_amount" IS NOT NULL AND ("total_amount"::text IN ('NaN','Infinity','-Infinity') OR abs("total_amount"::text::numeric) >= power(10::numeric, 13) OR "total_amount"::text::numeric <> round("total_amount"::text::numeric, 2))) THEN
    RAISE EXCEPTION 'Money preflight failed: orders.total_amount; inspect precision/range before migration';
  END IF;
  IF EXISTS (SELECT 1 FROM "order_items" WHERE "unit_price" IS NOT NULL AND ("unit_price"::text IN ('NaN','Infinity','-Infinity') OR abs("unit_price"::text::numeric) >= power(10::numeric, 9) OR "unit_price"::text::numeric <> round("unit_price"::text::numeric, 6))) THEN
    RAISE EXCEPTION 'Money preflight failed: order_items.unit_price; inspect precision/range before migration';
  END IF;
  IF EXISTS (SELECT 1 FROM "order_items" WHERE "total_price" IS NOT NULL AND ("total_price"::text IN ('NaN','Infinity','-Infinity') OR abs("total_price"::text::numeric) >= power(10::numeric, 13) OR "total_price"::text::numeric <> round("total_price"::text::numeric, 2))) THEN
    RAISE EXCEPTION 'Money preflight failed: order_items.total_price; inspect precision/range before migration';
  END IF;
  IF EXISTS (SELECT 1 FROM "payments" WHERE "amount" IS NOT NULL AND ("amount"::text IN ('NaN','Infinity','-Infinity') OR abs("amount"::text::numeric) >= power(10::numeric, 13) OR "amount"::text::numeric <> round("amount"::text::numeric, 2))) THEN
    RAISE EXCEPTION 'Money preflight failed: payments.amount; inspect precision/range before migration';
  END IF;
  IF EXISTS (SELECT 1 FROM "payments" WHERE "refunded_amount" IS NOT NULL AND ("refunded_amount"::text IN ('NaN','Infinity','-Infinity') OR abs("refunded_amount"::text::numeric) >= power(10::numeric, 13) OR "refunded_amount"::text::numeric <> round("refunded_amount"::text::numeric, 2))) THEN
    RAISE EXCEPTION 'Money preflight failed: payments.refunded_amount; inspect precision/range before migration';
  END IF;
  IF EXISTS (SELECT 1 FROM "transactions" WHERE "amount" IS NOT NULL AND ("amount"::text IN ('NaN','Infinity','-Infinity') OR abs("amount"::text::numeric) >= power(10::numeric, 13) OR "amount"::text::numeric <> round("amount"::text::numeric, 2))) THEN
    RAISE EXCEPTION 'Money preflight failed: transactions.amount; inspect precision/range before migration';
  END IF;
  IF EXISTS (SELECT 1 FROM "invoices" WHERE "subtotal" IS NOT NULL AND ("subtotal"::text IN ('NaN','Infinity','-Infinity') OR abs("subtotal"::text::numeric) >= power(10::numeric, 13) OR "subtotal"::text::numeric <> round("subtotal"::text::numeric, 2))) THEN
    RAISE EXCEPTION 'Money preflight failed: invoices.subtotal; inspect precision/range before migration';
  END IF;
  IF EXISTS (SELECT 1 FROM "invoices" WHERE "discount" IS NOT NULL AND ("discount"::text IN ('NaN','Infinity','-Infinity') OR abs("discount"::text::numeric) >= power(10::numeric, 13) OR "discount"::text::numeric <> round("discount"::text::numeric, 2))) THEN
    RAISE EXCEPTION 'Money preflight failed: invoices.discount; inspect precision/range before migration';
  END IF;
  IF EXISTS (SELECT 1 FROM "invoices" WHERE "gst" IS NOT NULL AND ("gst"::text IN ('NaN','Infinity','-Infinity') OR abs("gst"::text::numeric) >= power(10::numeric, 13) OR "gst"::text::numeric <> round("gst"::text::numeric, 2))) THEN
    RAISE EXCEPTION 'Money preflight failed: invoices.gst; inspect precision/range before migration';
  END IF;
  IF EXISTS (SELECT 1 FROM "invoices" WHERE "grand_total" IS NOT NULL AND ("grand_total"::text IN ('NaN','Infinity','-Infinity') OR abs("grand_total"::text::numeric) >= power(10::numeric, 13) OR "grand_total"::text::numeric <> round("grand_total"::text::numeric, 2))) THEN
    RAISE EXCEPTION 'Money preflight failed: invoices.grand_total; inspect precision/range before migration';
  END IF;
  IF EXISTS (SELECT 1 FROM "analytics_snapshots" WHERE "total_revenue" IS NOT NULL AND ("total_revenue"::text IN ('NaN','Infinity','-Infinity') OR abs("total_revenue"::text::numeric) >= power(10::numeric, 13) OR "total_revenue"::text::numeric <> round("total_revenue"::text::numeric, 2))) THEN
    RAISE EXCEPTION 'Money preflight failed: analytics_snapshots.total_revenue; inspect precision/range before migration';
  END IF;
  IF EXISTS (SELECT 1 FROM "analytics_snapshots" WHERE "average_order_value" IS NOT NULL AND ("average_order_value"::text IN ('NaN','Infinity','-Infinity') OR abs("average_order_value"::text::numeric) >= power(10::numeric, 9) OR "average_order_value"::text::numeric <> round("average_order_value"::text::numeric, 6))) THEN
    RAISE EXCEPTION 'Money preflight failed: analytics_snapshots.average_order_value; inspect precision/range before migration';
  END IF;
  IF EXISTS (SELECT 1 FROM "customer_restaurant_profiles" WHERE "total_spend" IS NOT NULL AND ("total_spend"::text IN ('NaN','Infinity','-Infinity') OR abs("total_spend"::text::numeric) >= power(10::numeric, 13) OR "total_spend"::text::numeric <> round("total_spend"::text::numeric, 2))) THEN
    RAISE EXCEPTION 'Money preflight failed: customer_restaurant_profiles.total_spend; inspect precision/range before migration';
  END IF;
  IF EXISTS (SELECT 1 FROM "customer_restaurant_profiles" WHERE "aov" IS NOT NULL AND ("aov"::text IN ('NaN','Infinity','-Infinity') OR abs("aov"::text::numeric) >= power(10::numeric, 9) OR "aov"::text::numeric <> round("aov"::text::numeric, 6))) THEN
    RAISE EXCEPTION 'Money preflight failed: customer_restaurant_profiles.aov; inspect precision/range before migration';
  END IF;
  IF EXISTS (SELECT 1 FROM "customer_restaurant_profiles" WHERE "ltv" IS NOT NULL AND ("ltv"::text IN ('NaN','Infinity','-Infinity') OR abs("ltv"::text::numeric) >= power(10::numeric, 9) OR "ltv"::text::numeric <> round("ltv"::text::numeric, 6))) THEN
    RAISE EXCEPTION 'Money preflight failed: customer_restaurant_profiles.ltv; inspect precision/range before migration';
  END IF;
  IF EXISTS (SELECT 1 FROM "customer_restaurant_profiles" WHERE "predicted_ltv" IS NOT NULL AND ("predicted_ltv"::text IN ('NaN','Infinity','-Infinity') OR abs("predicted_ltv"::text::numeric) >= power(10::numeric, 9) OR "predicted_ltv"::text::numeric <> round("predicted_ltv"::text::numeric, 6))) THEN
    RAISE EXCEPTION 'Money preflight failed: customer_restaurant_profiles.predicted_ltv; inspect precision/range before migration';
  END IF;
  IF EXISTS (SELECT 1 FROM "loyalty_tiers" WHERE "min_spend" IS NOT NULL AND ("min_spend"::text IN ('NaN','Infinity','-Infinity') OR abs("min_spend"::text::numeric) >= power(10::numeric, 13) OR "min_spend"::text::numeric <> round("min_spend"::text::numeric, 2))) THEN
    RAISE EXCEPTION 'Money preflight failed: loyalty_tiers.min_spend; inspect precision/range before migration';
  END IF;
  IF EXISTS (SELECT 1 FROM "coupons" WHERE "discount_value" IS NOT NULL AND ("discount_value"::text IN ('NaN','Infinity','-Infinity') OR abs("discount_value"::text::numeric) >= power(10::numeric, 9) OR "discount_value"::text::numeric <> round("discount_value"::text::numeric, 6))) THEN
    RAISE EXCEPTION 'Money preflight failed: coupons.discount_value; inspect precision/range before migration';
  END IF;
  IF EXISTS (SELECT 1 FROM "coupons" WHERE "min_order_amount" IS NOT NULL AND ("min_order_amount"::text IN ('NaN','Infinity','-Infinity') OR abs("min_order_amount"::text::numeric) >= power(10::numeric, 13) OR "min_order_amount"::text::numeric <> round("min_order_amount"::text::numeric, 2))) THEN
    RAISE EXCEPTION 'Money preflight failed: coupons.min_order_amount; inspect precision/range before migration';
  END IF;
  IF EXISTS (SELECT 1 FROM "coupons" WHERE "max_discount_amount" IS NOT NULL AND ("max_discount_amount"::text IN ('NaN','Infinity','-Infinity') OR abs("max_discount_amount"::text::numeric) >= power(10::numeric, 13) OR "max_discount_amount"::text::numeric <> round("max_discount_amount"::text::numeric, 2))) THEN
    RAISE EXCEPTION 'Money preflight failed: coupons.max_discount_amount; inspect precision/range before migration';
  END IF;
  IF EXISTS (SELECT 1 FROM "suppliers" WHERE "outstanding_balance" IS NOT NULL AND ("outstanding_balance"::text IN ('NaN','Infinity','-Infinity') OR abs("outstanding_balance"::text::numeric) >= power(10::numeric, 13) OR "outstanding_balance"::text::numeric <> round("outstanding_balance"::text::numeric, 2))) THEN
    RAISE EXCEPTION 'Money preflight failed: suppliers.outstanding_balance; inspect precision/range before migration';
  END IF;
  IF EXISTS (SELECT 1 FROM "raw_materials" WHERE "purchase_price" IS NOT NULL AND ("purchase_price"::text IN ('NaN','Infinity','-Infinity') OR abs("purchase_price"::text::numeric) >= power(10::numeric, 9) OR "purchase_price"::text::numeric <> round("purchase_price"::text::numeric, 6))) THEN
    RAISE EXCEPTION 'Money preflight failed: raw_materials.purchase_price; inspect precision/range before migration';
  END IF;
  IF EXISTS (SELECT 1 FROM "raw_materials" WHERE "average_cost" IS NOT NULL AND ("average_cost"::text IN ('NaN','Infinity','-Infinity') OR abs("average_cost"::text::numeric) >= power(10::numeric, 9) OR "average_cost"::text::numeric <> round("average_cost"::text::numeric, 6))) THEN
    RAISE EXCEPTION 'Money preflight failed: raw_materials.average_cost; inspect precision/range before migration';
  END IF;
  IF EXISTS (SELECT 1 FROM "stock_batches" WHERE "purchase_price" IS NOT NULL AND ("purchase_price"::text IN ('NaN','Infinity','-Infinity') OR abs("purchase_price"::text::numeric) >= power(10::numeric, 9) OR "purchase_price"::text::numeric <> round("purchase_price"::text::numeric, 6))) THEN
    RAISE EXCEPTION 'Money preflight failed: stock_batches.purchase_price; inspect precision/range before migration';
  END IF;
  IF EXISTS (SELECT 1 FROM "purchase_orders" WHERE "subtotal" IS NOT NULL AND ("subtotal"::text IN ('NaN','Infinity','-Infinity') OR abs("subtotal"::text::numeric) >= power(10::numeric, 13) OR "subtotal"::text::numeric <> round("subtotal"::text::numeric, 2))) THEN
    RAISE EXCEPTION 'Money preflight failed: purchase_orders.subtotal; inspect precision/range before migration';
  END IF;
  IF EXISTS (SELECT 1 FROM "purchase_orders" WHERE "gst_amount" IS NOT NULL AND ("gst_amount"::text IN ('NaN','Infinity','-Infinity') OR abs("gst_amount"::text::numeric) >= power(10::numeric, 13) OR "gst_amount"::text::numeric <> round("gst_amount"::text::numeric, 2))) THEN
    RAISE EXCEPTION 'Money preflight failed: purchase_orders.gst_amount; inspect precision/range before migration';
  END IF;
  IF EXISTS (SELECT 1 FROM "purchase_orders" WHERE "grand_total" IS NOT NULL AND ("grand_total"::text IN ('NaN','Infinity','-Infinity') OR abs("grand_total"::text::numeric) >= power(10::numeric, 13) OR "grand_total"::text::numeric <> round("grand_total"::text::numeric, 2))) THEN
    RAISE EXCEPTION 'Money preflight failed: purchase_orders.grand_total; inspect precision/range before migration';
  END IF;
  IF EXISTS (SELECT 1 FROM "purchase_order_items" WHERE "unit_price" IS NOT NULL AND ("unit_price"::text IN ('NaN','Infinity','-Infinity') OR abs("unit_price"::text::numeric) >= power(10::numeric, 9) OR "unit_price"::text::numeric <> round("unit_price"::text::numeric, 6))) THEN
    RAISE EXCEPTION 'Money preflight failed: purchase_order_items.unit_price; inspect precision/range before migration';
  END IF;
  IF EXISTS (SELECT 1 FROM "purchase_order_items" WHERE "total_cost" IS NOT NULL AND ("total_cost"::text IN ('NaN','Infinity','-Infinity') OR abs("total_cost"::text::numeric) >= power(10::numeric, 13) OR "total_cost"::text::numeric <> round("total_cost"::text::numeric, 2))) THEN
    RAISE EXCEPTION 'Money preflight failed: purchase_order_items.total_cost; inspect precision/range before migration';
  END IF;
  IF EXISTS (SELECT 1 FROM "wastage_records" WHERE "cost" IS NOT NULL AND ("cost"::text IN ('NaN','Infinity','-Infinity') OR abs("cost"::text::numeric) >= power(10::numeric, 13) OR "cost"::text::numeric <> round("cost"::text::numeric, 2))) THEN
    RAISE EXCEPTION 'Money preflight failed: wastage_records.cost; inspect precision/range before migration';
  END IF;
  IF EXISTS (SELECT 1 FROM "expenses" WHERE "amount" IS NOT NULL AND ("amount"::text IN ('NaN','Infinity','-Infinity') OR abs("amount"::text::numeric) >= power(10::numeric, 13) OR "amount"::text::numeric <> round("amount"::text::numeric, 2))) THEN
    RAISE EXCEPTION 'Money preflight failed: expenses.amount; inspect precision/range before migration';
  END IF;
END $$;
ALTER TABLE "subscription_plans"
  ALTER COLUMN "price" TYPE NUMERIC(15,2) USING "price"::text::numeric,
  ALTER COLUMN "price_6_month" TYPE NUMERIC(15,2) USING "price_6_month"::text::numeric,
  ALTER COLUMN "price_1_year" TYPE NUMERIC(15,2) USING "price_1_year"::text::numeric;
ALTER TABLE "promo_codes"
  ALTER COLUMN "value" TYPE NUMERIC(15,6) USING "value"::text::numeric;
ALTER TABLE "menu_items"
  ALTER COLUMN "price" TYPE NUMERIC(15,2) USING "price"::text::numeric;
ALTER TABLE "orders"
  ALTER COLUMN "subtotal" TYPE NUMERIC(15,2) USING "subtotal"::text::numeric,
  ALTER COLUMN "tax_amount" TYPE NUMERIC(15,2) USING "tax_amount"::text::numeric,
  ALTER COLUMN "total_amount" TYPE NUMERIC(15,2) USING "total_amount"::text::numeric;
ALTER TABLE "order_items"
  ALTER COLUMN "unit_price" TYPE NUMERIC(15,6) USING "unit_price"::text::numeric,
  ALTER COLUMN "total_price" TYPE NUMERIC(15,2) USING "total_price"::text::numeric;
ALTER TABLE "payments"
  ALTER COLUMN "amount" TYPE NUMERIC(15,2) USING "amount"::text::numeric,
  ALTER COLUMN "refunded_amount" TYPE NUMERIC(15,2) USING "refunded_amount"::text::numeric;
ALTER TABLE "transactions"
  ALTER COLUMN "amount" TYPE NUMERIC(15,2) USING "amount"::text::numeric;
ALTER TABLE "invoices"
  ALTER COLUMN "subtotal" TYPE NUMERIC(15,2) USING "subtotal"::text::numeric,
  ALTER COLUMN "discount" TYPE NUMERIC(15,2) USING "discount"::text::numeric,
  ALTER COLUMN "gst" TYPE NUMERIC(15,2) USING "gst"::text::numeric,
  ALTER COLUMN "grand_total" TYPE NUMERIC(15,2) USING "grand_total"::text::numeric;
ALTER TABLE "analytics_snapshots"
  ALTER COLUMN "total_revenue" TYPE NUMERIC(15,2) USING "total_revenue"::text::numeric,
  ALTER COLUMN "average_order_value" TYPE NUMERIC(15,6) USING "average_order_value"::text::numeric;
ALTER TABLE "customer_restaurant_profiles"
  ALTER COLUMN "total_spend" TYPE NUMERIC(15,2) USING "total_spend"::text::numeric,
  ALTER COLUMN "aov" TYPE NUMERIC(15,6) USING "aov"::text::numeric,
  ALTER COLUMN "ltv" TYPE NUMERIC(15,6) USING "ltv"::text::numeric,
  ALTER COLUMN "predicted_ltv" TYPE NUMERIC(15,6) USING "predicted_ltv"::text::numeric;
ALTER TABLE "loyalty_tiers"
  ALTER COLUMN "min_spend" TYPE NUMERIC(15,2) USING "min_spend"::text::numeric;
ALTER TABLE "coupons"
  ALTER COLUMN "discount_value" TYPE NUMERIC(15,6) USING "discount_value"::text::numeric,
  ALTER COLUMN "min_order_amount" TYPE NUMERIC(15,2) USING "min_order_amount"::text::numeric,
  ALTER COLUMN "max_discount_amount" TYPE NUMERIC(15,2) USING "max_discount_amount"::text::numeric;
ALTER TABLE "suppliers"
  ALTER COLUMN "outstanding_balance" TYPE NUMERIC(15,2) USING "outstanding_balance"::text::numeric;
ALTER TABLE "raw_materials"
  ALTER COLUMN "purchase_price" TYPE NUMERIC(15,6) USING "purchase_price"::text::numeric,
  ALTER COLUMN "average_cost" TYPE NUMERIC(15,6) USING "average_cost"::text::numeric;
ALTER TABLE "stock_batches"
  ALTER COLUMN "purchase_price" TYPE NUMERIC(15,6) USING "purchase_price"::text::numeric;
ALTER TABLE "purchase_orders"
  ALTER COLUMN "subtotal" TYPE NUMERIC(15,2) USING "subtotal"::text::numeric,
  ALTER COLUMN "gst_amount" TYPE NUMERIC(15,2) USING "gst_amount"::text::numeric,
  ALTER COLUMN "grand_total" TYPE NUMERIC(15,2) USING "grand_total"::text::numeric;
ALTER TABLE "purchase_order_items"
  ALTER COLUMN "unit_price" TYPE NUMERIC(15,6) USING "unit_price"::text::numeric,
  ALTER COLUMN "total_cost" TYPE NUMERIC(15,2) USING "total_cost"::text::numeric;
ALTER TABLE "wastage_records"
  ALTER COLUMN "cost" TYPE NUMERIC(15,2) USING "cost"::text::numeric;
ALTER TABLE "expenses"
  ALTER COLUMN "amount" TYPE NUMERIC(15,2) USING "amount"::text::numeric;
COMMIT;
