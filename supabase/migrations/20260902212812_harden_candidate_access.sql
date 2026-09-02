-- Candidate data is single-tenant and server-owned. Public submission and
-- administration are mediated by Edge Functions using server credentials.
alter table public.candidates enable row level security;

-- Browser roles must not access candidate PII directly.
revoke all privileges on table public.candidates from anon, authenticated;
revoke all privileges on sequence public.candidates_id_seq from anon, authenticated;
revoke usage, create on schema public from anon, authenticated;
grant usage on schema public to service_role;

-- Edge Functions only insert submissions and read them for administration.
revoke all privileges on table public.candidates from service_role;
grant select, insert on table public.candidates to service_role;
revoke all privileges on sequence public.candidates_id_seq from service_role;
grant usage on sequence public.candidates_id_seq to service_role;

-- Trigger/event-trigger functions are internal and are not public RPCs.
revoke execute on function public.set_candidates_updated_at()
  from public, anon, authenticated, service_role;
revoke execute on function public.rls_auto_enable()
  from public, anon, authenticated, service_role;

-- New objects created by migrations start closed and require explicit grants.
alter default privileges for role postgres in schema public
  revoke all privileges on tables from anon, authenticated, service_role;
alter default privileges for role postgres in schema public
  revoke all privileges on sequences from anon, authenticated, service_role;
alter default privileges for role postgres in schema public
  revoke execute on functions from public, anon, authenticated, service_role;
