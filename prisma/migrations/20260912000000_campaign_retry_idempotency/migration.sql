-- Campaign and recipient attempts are persisted so scheduler retries are bounded.
ALTER TABLE "campaigns"
ADD COLUMN "attempt_count" INTEGER NOT NULL DEFAULT 0;

ALTER TABLE "campaign_logs"
ADD COLUMN "attempt_count" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN "last_attempt_at" TIMESTAMP(3);

-- Fail safely if historical duplicates exist; do not silently discard delivery history.
CREATE UNIQUE INDEX "campaign_logs_campaign_id_customer_id_key"
ON "campaign_logs"("campaign_id", "customer_id");
