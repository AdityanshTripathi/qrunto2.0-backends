-- CRM and ownership lookups.
CREATE INDEX IF NOT EXISTS "restaurants_owner_id_idx" ON "restaurants" ("owner_id");
CREATE INDEX IF NOT EXISTS "restaurants_brand_id_idx" ON "restaurants" ("brand_id");
CREATE INDEX IF NOT EXISTS "subscriptions_plan_id_idx" ON "subscriptions" ("plan_id");
CREATE INDEX IF NOT EXISTS "customer_restaurant_profiles_restaurant_id_first_visit_idx" ON "customer_restaurant_profiles" ("restaurant_id", "first_visit");
CREATE INDEX IF NOT EXISTS "customer_restaurant_profiles_restaurant_id_last_visit_idx" ON "customer_restaurant_profiles" ("restaurant_id", "last_visit");
CREATE INDEX IF NOT EXISTS "loyalty_ledgers_order_id_idx" ON "loyalty_ledgers" ("order_id");
CREATE INDEX IF NOT EXISTS "customer_coupons_customer_id_coupon_id_is_redeemed_idx" ON "customer_coupons" ("customer_id", "coupon_id", "is_redeemed");
CREATE INDEX IF NOT EXISTS "customer_coupons_coupon_id_idx" ON "customer_coupons" ("coupon_id");
CREATE INDEX IF NOT EXISTS "customer_coupons_order_id_idx" ON "customer_coupons" ("order_id");
CREATE INDEX IF NOT EXISTS "campaigns_brand_id_status_scheduled_at_idx" ON "campaigns" ("brand_id", "status", "scheduled_at");
CREATE INDEX IF NOT EXISTS "campaign_logs_campaign_id_idx" ON "campaign_logs" ("campaign_id");

-- Public menu, order-item analytics, payments, and notifications.
CREATE INDEX IF NOT EXISTS "categories_restaurant_id_is_active_display_order_idx" ON "categories" ("restaurant_id", "is_active", "display_order");
CREATE INDEX IF NOT EXISTS "menu_items_restaurant_id_name_idx" ON "menu_items" ("restaurant_id", "name");
CREATE INDEX IF NOT EXISTS "menu_items_restaurant_id_is_available_name_idx" ON "menu_items" ("restaurant_id", "is_available", "name");
CREATE INDEX IF NOT EXISTS "order_items_menu_item_id_idx" ON "order_items" ("menu_item_id");
CREATE INDEX IF NOT EXISTS "payments_restaurant_id_status_paid_at_idx" ON "payments" ("restaurant_id", "status", "paid_at");
CREATE INDEX IF NOT EXISTS "notifications_restaurant_id_created_at_idx" ON "notifications" ("restaurant_id", "created_at");
CREATE INDEX IF NOT EXISTS "menu_view_logs_restaurant_id_viewed_at_idx" ON "menu_view_logs" ("restaurant_id", "viewed_at");
CREATE INDEX IF NOT EXISTS "cart_sessions_restaurant_id_session_id_idx" ON "cart_sessions" ("restaurant_id", "session_id");
CREATE INDEX IF NOT EXISTS "cart_sessions_restaurant_id_created_at_idx" ON "cart_sessions" ("restaurant_id", "created_at");

-- Inventory list, date-range, and child-relation lookups.
CREATE INDEX IF NOT EXISTS "purchase_orders_restaurant_id_order_date_idx" ON "purchase_orders" ("restaurant_id", "order_date");
CREATE INDEX IF NOT EXISTS "purchase_order_items_po_id_idx" ON "purchase_order_items" ("po_id");
CREATE INDEX IF NOT EXISTS "wastage_records_restaurant_id_waste_date_idx" ON "wastage_records" ("restaurant_id", "waste_date");
CREATE INDEX IF NOT EXISTS "stock_transfers_source_branch_id_created_at_idx" ON "stock_transfers" ("source_branch_id", "created_at");
CREATE INDEX IF NOT EXISTS "stock_transfers_dest_branch_id_created_at_idx" ON "stock_transfers" ("dest_branch_id", "created_at");
CREATE INDEX IF NOT EXISTS "stock_transfer_items_transfer_id_idx" ON "stock_transfer_items" ("transfer_id");
CREATE INDEX IF NOT EXISTS "stock_audits_restaurant_id_audit_date_idx" ON "stock_audits" ("restaurant_id", "audit_date");
CREATE INDEX IF NOT EXISTS "stock_audit_items_audit_id_idx" ON "stock_audit_items" ("audit_id");
CREATE INDEX IF NOT EXISTS "stock_ledgers_restaurant_id_action_type_created_at_idx" ON "stock_ledgers" ("restaurant_id", "action_type", "created_at");

-- Remove superseded single-column indexes after replacements exist.
DROP INDEX IF EXISTS "cart_sessions_restaurant_id_idx";
DROP INDEX IF EXISTS "cart_sessions_session_id_idx";
DROP INDEX IF EXISTS "categories_restaurant_id_idx";
DROP INDEX IF EXISTS "customer_coupons_customer_id_idx";
DROP INDEX IF EXISTS "customer_restaurant_profiles_restaurant_id_idx";
DROP INDEX IF EXISTS "menu_items_restaurant_id_idx";
DROP INDEX IF EXISTS "menu_view_logs_restaurant_id_idx";
DROP INDEX IF EXISTS "menu_view_logs_viewed_at_idx";
DROP INDEX IF EXISTS "notifications_restaurant_id_idx";
DROP INDEX IF EXISTS "payments_restaurant_id_idx";
DROP INDEX IF EXISTS "payments_restaurant_id_paid_at_idx";
DROP INDEX IF EXISTS "purchase_orders_restaurant_id_idx";
DROP INDEX IF EXISTS "stock_audits_restaurant_id_idx";
DROP INDEX IF EXISTS "stock_ledgers_restaurant_id_idx";
DROP INDEX IF EXISTS "wastage_records_restaurant_id_idx";
