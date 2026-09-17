-- Existing customers remain generation 1 so paid orders and invoices retain their history.
-- New dine-in CRM profiles use generation 2 and can reuse a phone within the same brand.
ALTER TABLE "public"."customers"
  ADD COLUMN "crm_generation" INTEGER NOT NULL DEFAULT 1,
  ADD COLUMN "phone_verified_at" TIMESTAMP(3),
  ADD COLUMN "dietary_preference" TEXT,
  ADD COLUMN "seating_preference" TEXT,
  ADD COLUMN "allergy_note" TEXT;
ALTER TABLE "public"."customers"
  ADD COLUMN "brand_total_spend" DECIMAL(15,2) NOT NULL DEFAULT 0,
  ADD COLUMN "brand_visit_count" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "brand_first_visit_at" TIMESTAMP(3),
  ADD COLUMN "brand_last_visit_at" TIMESTAMP(3);

DROP INDEX "public"."customers_brand_id_phone_key";
CREATE UNIQUE INDEX "customers_brand_id_phone_crm_generation_key"
  ON "public"."customers"("brand_id", "phone", "crm_generation");
CREATE INDEX "customers_brand_id_crm_generation_created_at_idx"
  ON "public"."customers"("brand_id", "crm_generation", "created_at");
CREATE INDEX "customers_brand_id_crm_generation_brand_last_visit_at_idx"
  ON "public"."customers"("brand_id", "crm_generation", "brand_last_visit_at");

CREATE TABLE "public"."customer_consents" (
  "id" TEXT NOT NULL,
  "customer_id" TEXT NOT NULL,
  "channel" TEXT NOT NULL,
  "purpose" TEXT NOT NULL,
  "granted" BOOLEAN NOT NULL,
  "source" TEXT NOT NULL,
  "notice_version" TEXT NOT NULL,
  "recorded_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "customer_consents_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "customer_consents_customer_id_channel_purpose_recorded_at_idx"
  ON "public"."customer_consents"("customer_id", "channel", "purpose", "recorded_at");
CREATE UNIQUE INDEX "customer_consents_customer_id_channel_purpose_source_key"
  ON "public"."customer_consents"("customer_id", "channel", "purpose", "source");
ALTER TABLE "public"."customer_consents"
  ADD CONSTRAINT "customer_consents_customer_id_fkey"
  FOREIGN KEY ("customer_id") REFERENCES "public"."customers"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

-- Server-owned CRM data is never exposed to browser Data API roles.
ALTER TABLE "public"."customer_consents" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON "public"."customer_consents" FROM PUBLIC, anon, authenticated;

CREATE TABLE "public"."customer_phone_verifications" (
  "id" TEXT NOT NULL,
  "brand_id" TEXT NOT NULL,
  "phone" TEXT NOT NULL,
  "code_hash" TEXT NOT NULL,
  "token_hash" TEXT,
  "expires_at" TIMESTAMP(3) NOT NULL,
  "verified_at" TIMESTAMP(3),
  "attempts" INTEGER NOT NULL DEFAULT 0,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "customer_phone_verifications_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "customer_phone_verifications_token_hash_key"
  ON "public"."customer_phone_verifications"("token_hash");
CREATE INDEX "customer_phone_verifications_brand_id_phone_created_at_idx"
  ON "public"."customer_phone_verifications"("brand_id", "phone", "created_at");
ALTER TABLE "public"."customer_phone_verifications" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON "public"."customer_phone_verifications" FROM PUBLIC, anon, authenticated;

ALTER TABLE "public"."loyalty_tiers" ADD COLUMN "crm_generation" INTEGER NOT NULL DEFAULT 1;
ALTER TABLE "public"."coupons" ADD COLUMN "crm_generation" INTEGER NOT NULL DEFAULT 1;
ALTER TABLE "public"."segments" ADD COLUMN "crm_generation" INTEGER NOT NULL DEFAULT 1;
ALTER TABLE "public"."campaigns" ADD COLUMN "crm_generation" INTEGER NOT NULL DEFAULT 1;
ALTER TYPE "public"."CampaignChannel" ADD VALUE IF NOT EXISTS 'WHATSAPP';
ALTER TYPE "public"."CampaignLogStatus" ADD VALUE IF NOT EXISTS 'DELIVERED';
ALTER TYPE "public"."CampaignLogStatus" ADD VALUE IF NOT EXISTS 'READ';
ALTER TABLE "public"."campaign_logs"
  ADD COLUMN "provider_message_id" TEXT,
  ADD COLUMN "delivered_at" TIMESTAMP(3),
  ADD COLUMN "read_at" TIMESTAMP(3);
CREATE UNIQUE INDEX "campaign_logs_provider_message_id_key" ON "public"."campaign_logs"("provider_message_id");
DROP INDEX "public"."loyalty_tiers_brand_id_name_key";
CREATE UNIQUE INDEX "loyalty_tiers_brand_id_name_crm_generation_key" ON "public"."loyalty_tiers"("brand_id", "name", "crm_generation");
DROP INDEX "public"."coupons_brand_id_code_key";
CREATE UNIQUE INDEX "coupons_brand_id_code_crm_generation_key" ON "public"."coupons"("brand_id", "code", "crm_generation");
DROP INDEX "public"."segments_brand_id_name_key";
CREATE UNIQUE INDEX "segments_brand_id_name_crm_generation_key" ON "public"."segments"("brand_id", "name", "crm_generation");

CREATE TABLE "public"."crm_loyalty_policies" (
  "brand_id" TEXT NOT NULL,
  "points_per_hundred_rupees" INTEGER NOT NULL DEFAULT 1,
  "max_redemption_percent" INTEGER NOT NULL DEFAULT 20,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "crm_loyalty_policies_pkey" PRIMARY KEY ("brand_id")
);
ALTER TABLE "public"."crm_loyalty_policies" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON "public"."crm_loyalty_policies" FROM PUBLIC, anon, authenticated;

CREATE TABLE "public"."brand_whatsapp_connections" (
  "brand_id" TEXT NOT NULL,
  "phone_number_id" TEXT NOT NULL,
  "encrypted_access_token" TEXT NOT NULL,
  "language_code" TEXT NOT NULL DEFAULT 'en_US',
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "brand_whatsapp_connections_pkey" PRIMARY KEY ("brand_id")
);
CREATE UNIQUE INDEX "brand_whatsapp_connections_phone_number_id_key" ON "public"."brand_whatsapp_connections"("phone_number_id");
ALTER TABLE "public"."brand_whatsapp_connections" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON "public"."brand_whatsapp_connections" FROM PUBLIC, anon, authenticated;
