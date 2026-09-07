-- Existing India-focused tenants; override individually with an IANA timezone.
ALTER TABLE "restaurants" ADD COLUMN "timezone" TEXT NOT NULL DEFAULT 'Asia/Kolkata';
