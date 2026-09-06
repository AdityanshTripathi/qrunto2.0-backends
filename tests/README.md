# Backend integration tests

Requires Node.js 24.x and installed locked dependencies. From the backend directory:

```sh
npm ci
npm run test:integration
```

The main command compiles TypeScript and runs Node's built-in `node:test` runner.
`npm test` is an alias. Files run in separate processes, sequentially; every test
has a 30-second ceiling and HTTP requests have a five-second timeout. Queue retry
tests use [Node virtual time](https://nodejs.org/docs/latest-v24.x/api/test.html#class-mocktimers);
contention uses promise barriers, not arbitrary sleeps. The test-only Fengari
dependency executes the real queue/CRM Lua scripts against in-memory commands.

## Isolation and cleanup

- `support/isolation.cjs` runs before application imports. It removes inherited
  application environment variables and disables dotenv loading.
- Signing keys are synthetic fixtures. No production credentials are requested.
- Prisma is replaced at the module boundary with a fail-closed double. The HTTP
  suite uses dedicated in-memory tenants, users, orders and payments, reset before
  each case; unknown database operations fail the suite.
- Outbound TCP is allowed only to loopback ports opened by the test process.
  TLS/external connections, including real database/Redis connections, are blocked.
- HTTP and Socket.IO servers close after tests. Node mocks restore automatically;
  process isolation disposes of remaining in-memory state.
- No test DB/Redis environment variables are required: this is a **mock-backed
  application integration suite**, not a live-service suite. A missing mock fails
  explicitly rather than falling through to a real service.
- Do not add the old `test:tenant-security` script to CI: it inspects existing
  database tenants. The new suite replaces that coverage at the application boundary.

## Coverage and limits

| Area | Exercised |
| --- | --- |
| Auth | Real routes, validation, bcrypt, JWT signing/verification, register/login/refresh, disabled user, profile, rate limits |
| Orders | Public creation and DB-derived prices, authenticated read/update/stats, scoped repository queries, cursor/limits, invalid transitions |
| Tenancy | Two isolated tenants, forged request and signed-token claims, active owner fallback, cross-tenant menu/order/payment rejection, real Socket.IO handshake and room membership |
| Inventory/jobs | Order-to-durable-queue handoff, duplicate enqueue, ledger idempotency, exact exponential delays, bounded retries/DLQ/audit, restart/reconnect recovery, lock expiry/ownership and concurrent workers |
| CRM | Real cron/status HTTP auth, rotated-secret rejection, scheduler checkpoint/lock reuse, bounded failures/DLQ/metrics and failure cleanup |
| Redis | Real shared manager and Socket.IO Redis adapter with mocked connections, two-client bound, concurrent reuse, bounded reconnect, cleanup, warm/module reuse |
| Monitoring | Liveness/readiness, dependency timeout and structured secret redaction |

**Payments: PARTIAL / DEFERRED.** Tests characterize current authenticated cash
settlement and sequential replay behavior. They also explicitly demonstrate that
the public `pay-mock` route accepts requests without provider proof and creates
duplicate payment records on replay. Passing these characterization tests is not
a payment security approval. Provider signature/amount verification, fake-payment
protection, concurrent idempotency, and atomic payment-to-queue delivery remain
named TODO tests. No deferred business logic is implemented.

**Database/Redis infrastructure: UNVERIFIED.** Doubles cannot establish PostgreSQL
RLS, foreign keys, rollback/isolation under concurrency, or real Redis/network/
serverless behavior. Lua executes in Fengari (Lua 5.3), not Redis's Lua runtime.
Exactly-once inventory assertions cover the
existing ledger check under controlled replay and lock contention, not a general
distributed exactly-once guarantee. Add disposable real-service CI coverage as a
separate lane before claiming those guarantees; never reuse production URLs.

## CI handoff

`.github/workflows/backend-ci.yml` runs on pushes to `main`, all pull requests,
and manual dispatch. Feature branches run through PRs, avoiding duplicate push/PR
runs. Superseded runs for the same event/PR/branch are cancelled. No path filters
are used, so a required check is not left pending on documentation-only PRs.

The job uses Node 24.x, caches npm downloads by lockfile (not `node_modules`),
runs `npm ci` (including the existing Prisma generation hook), validates Prisma,
and invokes the integration command, which already builds/type-checks with `tsc`.
It also runs the existing stalled-Redis preflight regression under the same
isolation preload. The other safe security/reliability scripts are already
covered by the suite. The live-tenant database script is intentionally excluded.
There is no configured ESLint baseline, so no new lint gate is introduced.

Only a credential-free, unreachable loopback database URL is supplied to schema
tooling; no migrations, service containers, production secrets or deployments run.
GitHub token permissions are read-only and checkout credentials are not persisted.
After these files and the test-suite changes are added to GitHub, enable Actions
if necessary and select **Backend checks** as a required check in the branch
ruleset after its first successful run. No repository secrets need to be added.

Use Node.js 24.x, run `npm ci`, then `npm run test:integration`; fail on nonzero
exit. No secrets, database, Redis service, deployment step, or existing test data
are needed. Keep TODO entries visible in review. CI can gate these application
regressions now; this does not approve production payment security or deployment.

The Lua regression exposed an existing CRM dead-letter bug: command names and
the `failed`/`EX` literals were unquoted. The only production-code change in this
test-suite task quotes those literals; retry counts and dead-letter policy stay
unchanged. The new test failed with no DLQ record before this fix.
