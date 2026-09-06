# Production monitoring (manual activation required)

No SDK, dependency, credentials, outbound notifications or deployment is added.
Existing `/health` and `/ready` behavior is unchanged. Existing CRM `/status`
remains unchanged. New `GET /api/internal/cron/crm/monitoring` uses the existing
`Authorization: Bearer <CRON_SECRET>` protection and `Cache-Control: no-store`.
It returns 200 when healthy, 503 for active alerts/unavailable checks, 401 for
invalid auth, or 503 when the server secret is missing. It runs before Redis
adapter gating, so a Redis outage cannot prevent an operational response.

The response contains uptime, readiness/Redis state, CRM/inventory counts, recent
numeric counters and fixed alert codes. No queue payloads, customer identifiers,
configuration, error details, URLs or headers are exposed. Probes run concurrently
with two-second deadlines and one in-flight operation each. No new Redis client,
key, mutation, job retry, or queue replay is introduced.

Recent metrics use a bounded five-minute process-local window in ten-second
buckets (up to ten seconds of boundary approximation). Cold starts reset them;
they are NOT fleet totals. API counts exclude health, internal probes and
Socket.IO polling. Existing cumulative Redis counters and DLQ depths are shared;
old recovered failure totals alone never trigger repeated-failure alerts.
Persisting DLQ entries do trigger alerts until operators resolve them.

The existing HTTP completion record now marks 5xx as error and requests >=2s as
warning, with `apiRequest`, `statusCode`, `durationMs`, safe codes and requestId.
`/ready` failures use `READINESS_UNHEALTHY`. Existing job retry/DLQ and Redis errors
feed counters without duplicate wrapper counting. Redis recovery and monitoring
alert/recovery transitions emit one additional record per local state change.
Do not treat absence of a recovery log as continued outage: use current probes.

The process monitor adds a redacted `service=process` record and preserves Node's
crash policy; it does not swallow failures or keep a broken process alive.
Node 24's default rejection mode routes unhandled rejections through this observer.
Native runtime/platform diagnostics remain outside this logger's redaction; keep
existing platform log access controls/redaction enabled and never put credentials
in exception messages. Non-default rejection handlers/modes require platform
exception alerts too. See [Node process monitoring](https://nodejs.org/api/process.html#event-uncaughtexceptionmonitor).

## Activate after a separately authorized deployment

1. In an independent uptime service, create HTTP monitors for the exact production
   HTTPS `/ready` and `/api/internal/cron/crm/monitoring` URLs. Require status 200;
   treat timeout, TLS/DNS error, 401, redirects or any other status as failure.
   Poll every 60 seconds (or the shortest included interval), timeout 10 seconds,
   alert after two failures and resolve after two successes. This also catches a
   stopped backend where application counters/logs cannot run.
2. Add the existing CRON_SECRET as the monitoring monitor's private Authorization
   header through the provider's secret/header UI. Never use URL/query parameters,
   screenshots, public status-page response bodies, repository files or CI secrets.
   Restrict provider access: this existing secret also authorizes cron execution.
   Update this private header whenever CRON_SECRET rotates. No header is needed on
   `/ready`. Keep monitors private and disable body/header capture where supported.
3. Select an on-call recipient and email channel, send a provider test notification,
   and confirm receipt. Enable recovery notifications and one open incident per
   environment/rule. No notifications have been sent by this change.
4. Use platform-native log alerts where available; otherwise route only the safe
   structured event fields to an existing log destination. Map the vendor-neutral
   [alert rules](alert-rules.json) to that destination's native query rules. This
   file is a specification, not an automatically installed provider configuration.
   Aggregate across ALL backend instances over five minutes; do not average
   instance percentages. Group by environment/service/rule, never by requestId.
   Retain requestId as an investigation field. Exclude health/internal/socket
   polling via `apiRequest=true` for API rate/latency rules. Confirm sustained
   conditions on two evaluations; alert immediately on process fatal events.
5. Enable the hosting platform's crash/function-error notifications and an external
   restart supervisor where applicable. Serverless process counters can disappear
   between polls; fleet log alerts are required for dependable rate, latency and
   repeated-job-failure detection. The protected endpoint alone is insufficient.

One compatible option is Better Stack's [HTTP monitors](https://betterstack.com/docs/uptime/uptime-monitor/)
with [custom request headers and confirmation settings](https://betterstack.com/docs/uptime/api/create-a-new-monitor/).
Use an existing/free allowance where available; verify account limits before
enabling paid log ingestion. No vendor account is required by the backend itself.

## Alert thresholds and response

- Readiness 503, Redis unavailable or queue status unavailable: inspect the current
  dependency probe and matching requestId logs, then platform/Redis service health.
- Either DLQ depth >0: inspect protected existing queue tools; confirm historical
  versus current failures before any separately approved replay/removal. Monitoring
  never clears, retries or rewrites jobs automatically.
- >=3 CRM/inventory retry/dead-letter events per service in 5m: inspect job/bucket
  and requestId correlation. Count inventory `deduction.local` failures too.
- >=3 Redis error events in 5m: inspect recovery and current readiness before
  deciding the outage persists.
- >=20 API requests, >=5 5xx and >=5% error rate in 5m: investigate correlated errors.
- >=20 API requests, >=10 requests taking >=2s and >=20% slow in 5m sustained over
  two checks: investigate dependency timing. This is a slow-request proportion,
  not p95, and excludes long-poll transport requests.
- Any process fatal event: inspect the safe code/correlation and host restart event.

## Verification

Locally run `npm run test:integration`, then
`node --require ./tests/support/isolation.cjs dist/scripts/test-preflight.js`.
All failure injection uses mocks, virtual timers and loopback HTTP; production
data is never needed. The existing CI discovers the new test automatically.
Payment/infrastructure deferrals remain unchanged.

After deployment: check public `/health` and `/ready`; check the monitoring endpoint
returns 401 without auth and 200/503 with its private header, no-store and requestId.
Compare CRM/inventory counts with existing `/api/internal/cron/crm/status`. Match
the response requestId to completion/transition logs. Use the provider's test
incident to verify notification and recovery delivery. Exercise Redis failure,
job retries/DLQ, latency and fatal scenarios only in local/staging fixtures; do not
inject production faults or clear production DLQs as a monitoring test.
