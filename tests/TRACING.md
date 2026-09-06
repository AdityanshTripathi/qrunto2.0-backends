# Request tracing

Run `npm run test:integration` on Node 24.x. Tests use the existing isolated
mock database/Redis setup and need no credentials or new environment variables.

HTTP APIs return `X-Request-ID`, including preflight, rejected auth, cron,
health and readiness responses. Only UUIDv4 client IDs (36 characters) are
accepted, normalized to lowercase; all other values are replaced using
`crypto.randomUUID()`. Clients must use opaque random IDs, never user data.
IDs are correlation hints, never authentication or idempotency keys.
CORS allows and exposes the header; its trusted origins and auth rules remain.

`getRequestId()` reads AsyncLocalStorage throughout asynchronous request work;
Express also exposes `res.locals.requestId`. Central structured log helpers add
the ID. One completion record contains method, status and duration, without URLs,
headers or bodies. Existing error redaction remains intact.

Inventory payloads persist the originating `requestId` across retries, delayed
requeue, processing recovery and dead-letter serialization. Older payloads remain
valid and receive an ID when processed. Standalone jobs and CRM cycles get fresh
IDs; local CRM execution receives a fresh ID per scheduled invocation. CRM retry
and DLQ logs retain job/bucket fields and the current invocation's ID, with the
same ID recorded in DLQ metadata. Separate cron deliveries receive separate IDs
unless the caller forwards the same valid `X-Request-ID`. No extra Redis keys,
connections or changes to locks, retention, retry bounds or QStash auth are needed.
Engine.IO applies tracing before the same CORS middleware so polling, preflight
and WebSocket upgrade responses also carry IDs. Socket.IO protocol and room
authorization are unchanged.

After a separately authorized deployment, check `/health`, `/ready`, an auth
rejection, authenticated order creation/update and an authenticated CRM cron call.
Match response IDs to structured logs. Use a dedicated test tenant to verify an
inventory deduction's payload/completion has its originating request ID. Check
an invalid ID is replaced and an allowed-origin preflight permits/exposes the
header. Retry/DLQ fault injection belongs in local tests, not production.
Existing payment and real-infrastructure deferrals remain unchanged.
