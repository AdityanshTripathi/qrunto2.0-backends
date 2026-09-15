-- Existing restaurants retain their current GST behavior unless the owner disables it.
ALTER TABLE "restaurant_settings" ADD COLUMN "gst_enabled" BOOLEAN NOT NULL DEFAULT true;
