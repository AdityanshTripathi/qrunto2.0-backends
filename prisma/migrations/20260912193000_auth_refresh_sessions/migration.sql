CREATE TABLE "auth_refresh_sessions" (
    "id" TEXT NOT NULL,
    "token_hash" TEXT NOT NULL,
    "user_id" TEXT,
    "waiter_id" TEXT,
    "expires_at" TIMESTAMP(3) NOT NULL,
    "revoked_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "auth_refresh_sessions_pkey"
        PRIMARY KEY ("id"),

    CONSTRAINT "auth_refresh_sessions_subject_check"
        CHECK (
            ("user_id" IS NOT NULL AND "waiter_id" IS NULL)
            OR
            ("user_id" IS NULL AND "waiter_id" IS NOT NULL)
        )
);

CREATE UNIQUE INDEX "auth_refresh_sessions_token_hash_key"
    ON "auth_refresh_sessions"("token_hash");

CREATE INDEX "auth_refresh_sessions_user_id_revoked_at_idx"
    ON "auth_refresh_sessions"("user_id", "revoked_at");

CREATE INDEX "auth_refresh_sessions_waiter_id_revoked_at_idx"
    ON "auth_refresh_sessions"("waiter_id", "revoked_at");

CREATE INDEX "auth_refresh_sessions_expires_at_idx"
    ON "auth_refresh_sessions"("expires_at");

ALTER TABLE "auth_refresh_sessions"
    ADD CONSTRAINT "auth_refresh_sessions_user_id_fkey"
    FOREIGN KEY ("user_id")
    REFERENCES "users"("id")
    ON DELETE CASCADE
    ON UPDATE CASCADE;

ALTER TABLE "auth_refresh_sessions"
    ADD CONSTRAINT "auth_refresh_sessions_waiter_id_fkey"
    FOREIGN KEY ("waiter_id")
    REFERENCES "waiters"("id")
    ON DELETE CASCADE
    ON UPDATE CASCADE;

-- Defense in depth for this security-sensitive token table.
-- The application runtime role currently has BYPASSRLS.
ALTER TABLE "auth_refresh_sessions"
    ENABLE ROW LEVEL SECURITY;