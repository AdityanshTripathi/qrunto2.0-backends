-- Additive only: preserve existing delivery logs and stop automatic resend after ambiguity.
ALTER TYPE "CampaignLogStatus" ADD VALUE IF NOT EXISTS 'PENDING_RECONCILIATION';
