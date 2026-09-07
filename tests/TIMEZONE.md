# Phase 5.3 — restaurant timezone correctness

## Source and storage

`restaurants.timezone` is an IANA name. Migration `20260907000000_restaurant_timezone`
adds a non-null column with `Asia/Kolkata`, matching the existing INR/GST/India
product defaults. Review non-India tenants before rollout and set their actual
zone through the existing authenticated `PATCH /api/settings` (`timezone` field).
Invalid settings writes return 400; missing/invalid legacy values fall back to
the migration default. No IP inference, server TZ dependency or new env var.

Existing timestamp columns and values remain UTC. No historical data is rewritten.
The migration was created, not applied. Generate the Prisma client before building.
Public menu metadata, settings and existing auth restaurant objects expose the
additive timezone field. Timestamp responses remain unchanged UTC instants.
`GET /api/auth/me` also exposes `user.restaurantTimezone` resolved from the
authenticated tenant, so staff and multi-restaurant users do not inherit the
timezone of the first restaurant in their profile list.

## Audit and resulting semantics

| Area | Finding / resolution |
| --- | --- |
| Dashboard | “Today's” KPI queried lifetime orders; now scoped to tenant day. Seven-day chart keys and frontend charts used UTC/browser dates; now tenant dates. |
| Analytics, financials | Server/UTC midnight bounds and UTC daily/monthly/hour grouping; now tenant date ranges and local buckets. Inclusive date inputs become UTC boundaries. DST days may be 23/25 hours. Repeated occupancy hours remain distinct. |
| Orders | Server-midnight date filter and browser-derived request dates; now tenant dates. Explicit offset timestamps remain instants for start/end filters. |
| CRM segments | Server `setDate` cutoff; now each restaurant profile uses its own calendar cutoff within the existing brand scope. `visitedWithinDays=N` includes local dates from today minus N; `lastVisitDaysAgo=N` includes dates at least N calendar days old. Spend/order rules unchanged. |
| RFM | Elapsed 24-hour recency; now calendar days in the selected profile restaurant zone. Existing profile-selection/scoring logic retained. |
| CRM occasions | Server date and same-day birthdays incorrectly rolling to next year; now profile-local date, date-only metadata and scoped notifications. Brand upcoming lists use the nearest occasion across associated restaurant profiles. |
| Coupons/campaigns | Browser-local datetime conversion and end-date midnight expiry; date-only coupons now include the full final local day. Campaign local datetime resolves in creating restaurant's zone. Offset-bearing instants retain their meaning. DST gaps return 400; overlaps choose the earlier instant. |
| Loyalty/referrals | Loyalty entries are instants; no separate points-expiry job exists. Existing referral 30-day elapsed validity retained. |
| Inventory | Server “today” metrics and UTC daily consumption buckets corrected. Purchase/receipt/waste/expiry date-only inputs now resolve in tenant zone; explicit timestamp semantics retained. |
| Invoices/customer/waiter | Browser-local display corrected using restaurant zone on the original UTC timestamp, without shifting the timestamp first. Calendar labels use UTC solely to render date-only values unchanged. |
| Jobs/QStash/Redis | Invocation, UTC scheduler buckets, locks, retries, TTLs and cadence unchanged. Segment/occasion business evaluation resolves profile restaurant zones at execution. Campaign due checks still compare UTC instants. |
| Subscriptions/platform | Billing durations remain elapsed UTC days, with host-local `setDate` removed; tenant notification dates use tenant zone. Cross-tenant superadmin reporting explicitly uses UTC. |
| SQL | No timezone-unaware SQL day grouping/date filter found; audited reporting uses Prisma UTC range predicates. |

Money calculations, auth rules, payment verification/idempotency/webhooks,
Socket.IO, tracing, monitoring and CI infrastructure were not rewritten.

## Verification

- `npm run test:integration` (includes analytics, CRM, order, tenant isolation,
  inventory, money, Redis, monitoring, tracing and timezone regressions).
- `npm run typecheck`, `npm run lint`, `npx --no-install prisma validate`.
- CI preflight: `node --require ./tests/support/isolation.cjs dist/scripts/test-preflight.js`.
- Frontend: `npm run build`; `node --test tests/timezone.test.cjs`.
- Regression cases: Kolkata 00:30 on prior UTC date; UTC; New York spring/fall
  DST; Lord Howe half-hour DST; Sao Paulo midnight gap; Apia skipped day;
  yesterday/month ranges; financial query isolation; sales heatmap; CRM
  recency/occasions; invalid zones/dates; machine/browser TZ independence.

Final local result: 69 backend tests passed, 3 pre-existing TODOs, 0 failures;
1 frontend timezone test passed. Backend/frontend builds, typecheck, lint,
Prisma schema validation and the CI preflight passed. No production DB was used.

## Exact manual production verification (future approved rollout)

1. Review pending migrations and tenant geography. Back up normally. In the
   approved deployment process run `npx --no-install prisma migrate deploy`
   and `npx --no-install prisma generate`; deploy the reviewed build separately.
2. In each test tenant's authenticated session, send
   `PATCH /api/settings` with `{"timezone":"Asia/Kolkata"}`, `{"timezone":"UTC"}`,
   or `{"timezone":"America/New_York"}` respectively. Verify `GET /api/settings`
   and `GET /api/public/<slug>` report the same zone. An invalid zone must return 400.
3. Using existing test records or an approved test order, verify a UTC timestamp
   `2026-08-31T19:00:00Z` appears as September 1, 00:30 for Kolkata, but August 31
   for UTC. Request `/api/orders?date=2026-09-01` and
   `/api/analytics/financials?startDate=2026-09-01&endDate=2026-09-01` in each tenant.
   Kolkata includes that order; UTC excludes it. Foreign-tenant orders must never
   appear. Confirm stored timestamp and money values are unchanged.
4. In the New York tenant inspect March 8 and November 1, 2026 reporting ranges:
   `[2026-03-08T05:00Z,2026-03-09T04:00Z)` and
   `[2026-11-01T04:00Z,2026-11-02T05:00Z)`. Check dashboard, sales heatmap,
   inventory daily report, CRM recency and invoice against the same records.
5. Change browser timezone to a different region, reload, and repeat date filter,
   invoice and customer order display checks. Schedule a test campaign and inspect
   its stored UTC instant; gap `2026-03-08T02:30` in New York must be rejected.
   Confirm existing cron monitoring remains healthy; do not trigger real customer
   sends solely for verification.

## Retained limitations / deferred

- Existing UTC date prefixes in order/transfer identifiers remain opaque IDs;
  they are not reporting dates and are not rewritten.
- Existing occasion cadence is daily, not guaranteed restaurant-local midnight.
  Catch-up/deduplication architecture is unchanged. Brand customers without any
  restaurant profile have no defensible restaurant timezone and are not included
  in profile-based occasion delivery.
- Historical date-only inputs previously stored as UTC midnight cannot be safely
  distinguished from genuine instants; no speculative data repair is attempted.
- Changing a restaurant timezone re-buckets historical reports. Existing scheduled
  campaigns/coupon instants do not shift retroactively.
- Existing dashboard pagination/data coverage, cross-brand profile-selection policy,
  and the three pre-existing payment/infrastructure test TODOs remain out of scope.
