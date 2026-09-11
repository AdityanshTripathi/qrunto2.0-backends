CREATE TABLE "public"."checkout_idempotencies" (
    "id" TEXT NOT NULL,
    "restaurant_id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "request_hash" TEXT NOT NULL,
    "order_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "checkout_idempotencies_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "checkout_idempotencies_restaurant_id_key_key"
    ON "public"."checkout_idempotencies"("restaurant_id", "key");

CREATE INDEX "checkout_idempotencies_order_id_idx"
    ON "public"."checkout_idempotencies"("order_id");

ALTER TABLE "public"."checkout_idempotencies"
    ADD CONSTRAINT "checkout_idempotencies_restaurant_id_fkey"
    FOREIGN KEY ("restaurant_id") REFERENCES "public"."restaurants"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "public"."checkout_idempotencies"
    ADD CONSTRAINT "checkout_idempotencies_order_id_fkey"
    FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;
