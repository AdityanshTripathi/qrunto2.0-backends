# Ordio backend production runbook

## Deployment

1. Confirm the intended commit and a clean worktree. Run `npm ci`, `npx prisma validate`, `npx tsc --noEmit`, `npm run build`, and `npm test` in CI.
2. Review `npx prisma migrate status` against the deployment database without printing connection details. If a migration is pending, take and verify a restorable database backup first.
3. Review migration SQL for locks and historical-data compatibility. Apply additive indexes during a low-traffic window, then verify the expected indexes exist before deploying code that depends on them.
4. Deploy the application only after migrations succeed. Never work around a failed migration by marking it applied without reconciling the database state.
5. Smoke-test the deployment and watch Vercel, database, Redis, queue, and CRM signals through at least one scheduled CRM cycle.

## Smoke tests

- `GET /health` returns 200 and `{ "status": "alive" }` without depending on external services.
- `GET /ready` returns 200 only when PostgreSQL and Redis are healthy; investigate a 503 rather than bypassing it.
- `GET /api/internal/cron/crm` without the bearer secret returns 401. Never place the real secret in shell history or screenshots.
- Authenticated order, public menu, and cash-settlement status endpoints return their expected safe response shapes.
- Socket authentication rejects missing/invalid tokens and isolates restaurant rooms.

## Incidents

### Database unavailable

Confirm `/ready`, Supabase health, pooler reachability, and Vercel errors. Do not increase pool size before identifying saturation. Pause migrations and write-heavy releases; restore service or fail over through the approved Supabase procedure.

### Redis unavailable

Expect readiness degradation, unavailable shared realtime state, and paused durable queue/CRM work. Inspect reconnect and queue metrics. Restore Redis first; idempotent queue and CRM processing can then resume.

### CRM cron failure

Inspect protected CRM status/monitoring, retry count, DLQ count, request ID, and QStash delivery. Correct the dependency or code failure before replay. Campaign and recipient attempts are bounded; do not manually recycle completed campaigns.

### Inventory DLQ

Identify the order and restaurant from safe structured identifiers, reconcile payment/order/inventory state, correct the cause, and use an audited recovery path. Never delete a DLQ entry merely to clear an alert.

### High 5xx or latency

Correlate Vercel request IDs with dependency and queue signals. Check database pool timeouts, slow query shapes, Redis reconnects, and deployment changes. Roll back code when the regression is isolated to the release.

### Failed deployment or migration

For an application failure, roll back to the last verified deployment after confirming schema compatibility. For a migration failure, stop application rollout, preserve evidence, and reconcile the partial state from the migration table and catalog.

## Rollback

- Code rollback is safe only when the deployed schema remains backward-compatible with the prior application.
- Additive P3 indexes may be dropped after code rollback if necessary, but dropping them can restore the original query cost and should occur in a low-traffic window.
- Do not blindly reverse destructive or data-transforming migrations. Restore from a verified backup when data cannot be reconstructed safely.

## Observability

- Vercel logs: HTTP latency/5xx, dependency failures, fatal events, and correlation IDs.
- GitHub Actions: schema validation, build, tests, and preflight regression.
- Redis/inventory: ready, processing, success, retry, failure, and DLQ counts.
- CRM: cycle start/completion/duration plus processed, failed, retry, and DLQ counts.
- Protected `/api/internal/cron/crm/monitoring`: readiness and bounded alert conditions.
