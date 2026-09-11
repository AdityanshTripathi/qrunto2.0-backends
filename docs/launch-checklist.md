# Ordio backend launch checklist

## Local and CI

- [ ] Intended commit and branch verified; worktree contains no accidental files.
- [ ] `npm ci` succeeds on the CI Node version.
- [ ] `npx prisma validate` succeeds.
- [ ] `npx tsc --noEmit`, `npm run build`, and `npm test` succeed with zero failures.
- [ ] Intentional external-infrastructure TODO tests remain visible and are not fake-passed.
- [ ] No generated `dist` churn, `.env`, credentials, backups, or local logs are staged.

## Database and migrations

- [ ] `prisma migrate status` is understood for the target environment.
- [ ] Every pending migration has a reviewed backup, rollout, verification, and rollback plan.
- [ ] Query indexes match tenant/status/date/cursor paths and do not replace tenant filters.
- [ ] No destructive migration is rolled back blindly.

## Security and correctness

- [ ] Authentication, role middleware, tenant isolation, CORS, safe errors, and request IDs pass regression tests.
- [ ] Cash settlement and replay remain idempotent; online payment/provider paths remain disabled.
- [ ] Inventory serializable deduction, recovery queue, retries, and DLQ pass.
- [ ] CRM cron authorization, locking, bounded retry/DLQ, recipient idempotency, and campaign completion suppression pass.
- [ ] Socket authentication, tenant rooms, reconnects, and shared adapter behavior pass.
- [ ] Production debug/test routes are unavailable and no default secret is accepted.

## Deployment and smoke

- [ ] Database backup verified when a migration exists; migration deploy completes before application deploy.
- [ ] `/health` and `/ready` are healthy after deployment.
- [ ] Protected cron returns 401 without authorization and succeeds only through the approved scheduler.
- [ ] Critical authenticated and public endpoints are available with expected response shapes.
- [ ] Vercel, database, Redis, inventory queue/DLQ, CRM, and 5xx/latency monitoring show no regression.
- [ ] Rollback owner and last known-good application version are recorded.
