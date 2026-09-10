-- P0.1: Lock down direct browser-role access to server-owned public schema.
-- ORDiO backend/frontend do not use Supabase Data API directly.
-- service_role is intentionally NOT bulk-revoked here because an older
-- candidates migration may depend on server-side service_role access.

-- 1. Enable RLS on every existing base/partitioned table in public.
DO $$
DECLARE
  r record;
BEGIN
  FOR r IN
    SELECT n.nspname AS schema_name,
           c.relname AS table_name
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public'
      AND c.relkind IN ('r', 'p')
  LOOP
    EXECUTE format(
      'ALTER TABLE %I.%I ENABLE ROW LEVEL SECURITY',
      r.schema_name,
      r.table_name
    );
  END LOOP;
END
$$;

-- 2. Remove direct Data API access from browser roles.
REVOKE ALL PRIVILEGES ON ALL TABLES IN SCHEMA public
FROM anon, authenticated;

REVOKE ALL PRIVILEGES ON ALL TABLES IN SCHEMA public
FROM PUBLIC;

REVOKE ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA public
FROM anon, authenticated;

REVOKE ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA public
FROM PUBLIC;

-- 3. Public schema functions must not be callable as RPCs by browser roles.
REVOKE EXECUTE ON ALL FUNCTIONS IN SCHEMA public
FROM anon, authenticated;

REVOKE EXECUTE ON ALL FUNCTIONS IN SCHEMA public
FROM PUBLIC;

-- 4. Close schema-level access inherited through PUBLIC.
REVOKE CREATE, USAGE ON SCHEMA public
FROM anon, authenticated;

REVOKE CREATE, USAGE ON SCHEMA public
FROM PUBLIC;

-- Preserve server-side Supabase service-role schema access.
GRANT USAGE ON SCHEMA public TO service_role;

-- 5. New objects must also start closed.
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public
  REVOKE ALL PRIVILEGES ON TABLES
  FROM anon, authenticated;

ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public
  REVOKE ALL PRIVILEGES ON TABLES
  FROM PUBLIC;

ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public
  REVOKE ALL PRIVILEGES ON SEQUENCES
  FROM anon, authenticated;

ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public
  REVOKE ALL PRIVILEGES ON SEQUENCES
  FROM PUBLIC;

ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public
  REVOKE EXECUTE ON FUNCTIONS
  FROM anon, authenticated;

ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public
  REVOKE EXECUTE ON FUNCTIONS
  FROM PUBLIC;
