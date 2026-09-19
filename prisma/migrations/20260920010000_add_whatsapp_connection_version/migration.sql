-- A version changes whenever credentials are rotated, preventing delayed work
-- for an earlier connection from changing the current connection state.
ALTER TABLE "public"."brand_whatsapp_connections"
  ADD COLUMN "connection_version" UUID;

UPDATE "public"."brand_whatsapp_connections"
  SET "connection_version" = gen_random_uuid()
  WHERE "connection_version" IS NULL;

ALTER TABLE "public"."brand_whatsapp_connections"
  ALTER COLUMN "connection_version" SET NOT NULL,
  ALTER COLUMN "connection_version" SET DEFAULT gen_random_uuid();

CREATE UNIQUE INDEX "brand_whatsapp_connections_connection_version_key"
  ON "public"."brand_whatsapp_connections"("connection_version");
