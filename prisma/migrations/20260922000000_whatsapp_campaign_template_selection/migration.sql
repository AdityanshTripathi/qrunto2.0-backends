-- Nullable and additive by design: historical campaigns and drafts remain readable.
-- Queue/send code requires all fields for WhatsApp delivery, so legacy rows cannot
-- bypass the server-verified template cache after this migration is applied.
ALTER TABLE "public"."campaigns"
  ADD COLUMN "whatsapp_template_id" TEXT,
  ADD COLUMN "whatsapp_template_language" TEXT,
  ADD COLUMN "whatsapp_template_category" TEXT,
  ADD COLUMN "whatsapp_template_parameters" JSONB,
  ADD COLUMN "whatsapp_connection_version" UUID;

CREATE INDEX "campaigns_brand_id_whatsapp_template_id_idx"
  ON "public"."campaigns"("brand_id", "whatsapp_template_id");
