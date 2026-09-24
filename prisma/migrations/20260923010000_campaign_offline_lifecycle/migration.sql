-- Additive campaign lifecycle hardening. Historical campaigns and delivery logs are preserved.
ALTER TYPE "CampaignStatus" ADD VALUE IF NOT EXISTS 'EXHAUSTED';
ALTER TYPE "CampaignStatus" ADD VALUE IF NOT EXISTS 'CANCELLED';

ALTER TYPE "CampaignLogStatus" ADD VALUE IF NOT EXISTS 'DISPATCHING';
ALTER TYPE "CampaignLogStatus" ADD VALUE IF NOT EXISTS 'EXHAUSTED';
ALTER TYPE "CampaignLogStatus" ADD VALUE IF NOT EXISTS 'PERMANENTLY_INELIGIBLE';
ALTER TYPE "CampaignLogStatus" ADD VALUE IF NOT EXISTS 'CANCELLED';

CREATE TABLE "campaign_requests" (
    "id" TEXT NOT NULL,
    "brand_id" TEXT NOT NULL,
    "operation" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "payload_hash" TEXT NOT NULL,
    "campaign_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "campaign_requests_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "campaign_requests_brand_operation_key_key" UNIQUE ("brand_id", "operation", "key")
);

CREATE INDEX "campaign_requests_campaign_id_idx" ON "campaign_requests"("campaign_id");

ALTER TABLE "campaign_requests" ADD CONSTRAINT "campaign_requests_brand_id_fkey"
    FOREIGN KEY ("brand_id") REFERENCES "brands"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "campaign_requests" ADD CONSTRAINT "campaign_requests_campaign_id_fkey"
    FOREIGN KEY ("campaign_id") REFERENCES "campaigns"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- This durable pre-dispatch marker lets cancellation distinguish an unstarted
-- recipient claim from a provider request whose outcome must be reconciled.
ALTER TABLE "campaign_logs" ADD COLUMN IF NOT EXISTS "provider_dispatch_started_at" TIMESTAMP(3);
