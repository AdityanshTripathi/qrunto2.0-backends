-- P3 query-shape indexes. Apply during a low-traffic window because PostgreSQL
-- index creation can briefly contend with writes on large existing tables.

-- Default customer list: WHERE brand_id = ? ORDER BY created_at, id.
CREATE INDEX IF NOT EXISTS "customers_brand_id_created_at_id_idx"
ON "customers" ("brand_id", "created_at", "id");
DROP INDEX IF EXISTS "customers_brand_id_idx";

-- Tenant campaign list and global scheduler due/stale scans.
CREATE INDEX IF NOT EXISTS "campaigns_brand_id_created_at_id_idx"
ON "campaigns" ("brand_id", "created_at", "id");
CREATE INDEX IF NOT EXISTS "campaigns_status_scheduled_at_id_idx"
ON "campaigns" ("status", "scheduled_at", "id");
CREATE INDEX IF NOT EXISTS "campaigns_status_updated_at_idx"
ON "campaigns" ("status", "updated_at");

-- Cursor-paginated recipient history for one campaign.
CREATE INDEX IF NOT EXISTS "campaign_logs_campaign_id_created_at_id_idx"
ON "campaign_logs" ("campaign_id", "created_at", "id");

-- Bounded global transaction history for the superadmin console.
CREATE INDEX IF NOT EXISTS "payments_created_at_id_idx"
ON "payments" ("created_at", "id");

-- Inventory recovery pending scan and batched completion lookup.
CREATE INDEX IF NOT EXISTS "audit_logs_action_entity_type_created_at_idx"
ON "audit_logs" ("action", "entity_type", "created_at");
CREATE INDEX IF NOT EXISTS "audit_logs_action_entity_type_entity_id_idx"
ON "audit_logs" ("action", "entity_type", "entity_id");
