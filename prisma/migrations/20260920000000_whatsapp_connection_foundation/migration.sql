-- Additive foundation for Meta Embedded Signup. Existing encrypted manual
-- connections remain LEGACY_CONNECTED/MANUAL and retain their sender and token fields.
CREATE TYPE "public"."WhatsAppConnectionStatus" AS ENUM ('LEGACY_CONNECTED', 'CONNECTED', 'NEEDS_REAUTH', 'DISCONNECTED', 'ERROR');
CREATE TYPE "public"."WhatsAppConnectionSource" AS ENUM ('MANUAL', 'EMBEDDED_SIGNUP');

ALTER TABLE "public"."brand_whatsapp_connections"
  ADD COLUMN "waba_id" TEXT,
  ADD COLUMN "meta_business_id" TEXT,
  ADD COLUMN "display_name" TEXT,
  ADD COLUMN "display_phone_number" TEXT,
  ADD COLUMN "status" "public"."WhatsAppConnectionStatus" NOT NULL DEFAULT 'LEGACY_CONNECTED',
  ADD COLUMN "source" "public"."WhatsAppConnectionSource" NOT NULL DEFAULT 'MANUAL',
  ADD COLUMN "token_expires_at" TIMESTAMP(3),
  ADD COLUMN "connected_at" TIMESTAMP(3),
  ADD COLUMN "last_validated_at" TIMESTAMP(3),
  ADD COLUMN "last_template_sync_at" TIMESTAMP(3),
  ADD COLUMN "last_error_code" TEXT,
  ADD COLUMN "last_error_message" TEXT;

CREATE INDEX "brand_whatsapp_connections_waba_id_idx"
  ON "public"."brand_whatsapp_connections"("waba_id");
CREATE INDEX "brand_whatsapp_connections_status_idx"
  ON "public"."brand_whatsapp_connections"("status");

-- state_hash is server-generated and hashed. The later consumer must atomically
-- claim a row only when consumed_at IS NULL and expires_at is in the future.
CREATE TABLE "public"."brand_whatsapp_connection_attempts" (
  "id" TEXT NOT NULL,
  "brand_id" TEXT NOT NULL,
  "actor_user_id" TEXT NOT NULL,
  "state_hash" TEXT NOT NULL,
  "expires_at" TIMESTAMP(3) NOT NULL,
  "consumed_at" TIMESTAMP(3),
  "completed_at" TIMESTAMP(3),
  "failed_at" TIMESTAMP(3),
  "failure_code" TEXT,
  "failure_message" TEXT,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "brand_whatsapp_connection_attempts_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "brand_whatsapp_connection_attempts_state_hash_key"
  ON "public"."brand_whatsapp_connection_attempts"("state_hash");
CREATE INDEX "brand_whatsapp_connection_attempts_brand_id_actor_user_id_created_at_idx"
  ON "public"."brand_whatsapp_connection_attempts"("brand_id", "actor_user_id", "created_at");
CREATE INDEX "brand_whatsapp_connection_attempts_expires_at_idx"
  ON "public"."brand_whatsapp_connection_attempts"("expires_at");
CREATE INDEX "brand_whatsapp_connection_attempts_brand_id_consumed_at_idx"
  ON "public"."brand_whatsapp_connection_attempts"("brand_id", "consumed_at");
ALTER TABLE "public"."brand_whatsapp_connection_attempts"
  ADD CONSTRAINT "brand_whatsapp_connection_attempts_brand_id_fkey"
  FOREIGN KEY ("brand_id") REFERENCES "public"."brands"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT "brand_whatsapp_connection_attempts_actor_user_id_fkey"
  FOREIGN KEY ("actor_user_id") REFERENCES "public"."users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "public"."brand_whatsapp_connection_attempts" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON "public"."brand_whatsapp_connection_attempts" FROM PUBLIC, anon, authenticated;

CREATE TABLE "public"."brand_whatsapp_templates" (
  "id" TEXT NOT NULL,
  "brand_id" TEXT NOT NULL,
  "waba_id" TEXT NOT NULL,
  "meta_template_id" TEXT,
  "template_name" TEXT NOT NULL,
  "language_code" TEXT NOT NULL,
  "category" TEXT,
  "approval_status" TEXT NOT NULL,
  "components_json" JSONB,
  "parameter_schema" JSONB,
  "last_synced_at" TIMESTAMP(3) NOT NULL,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "brand_whatsapp_templates_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "brand_whatsapp_templates_brand_id_waba_id_template_name_language_code_key"
  ON "public"."brand_whatsapp_templates"("brand_id", "waba_id", "template_name", "language_code");
CREATE INDEX "brand_whatsapp_templates_brand_id_approval_status_language_code_idx"
  ON "public"."brand_whatsapp_templates"("brand_id", "approval_status", "language_code");
CREATE INDEX "brand_whatsapp_templates_meta_template_id_idx"
  ON "public"."brand_whatsapp_templates"("meta_template_id");
ALTER TABLE "public"."brand_whatsapp_templates"
  ADD CONSTRAINT "brand_whatsapp_templates_brand_id_fkey"
  FOREIGN KEY ("brand_id") REFERENCES "public"."brands"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "public"."brand_whatsapp_templates" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON "public"."brand_whatsapp_templates" FROM PUBLIC, anon, authenticated;
