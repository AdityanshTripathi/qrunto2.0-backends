# Phase 4.6: focused backend cleanup

No ESLint configuration existed. This phase uses the installed TypeScript
compiler rather than adding a new dependency stack:

- `npm run typecheck`: strict TypeScript checks without generated output.
- `npm run lint`: compiler correctness checks, including unreachable code,
  unused labels and switch fallthrough. This is not an ESLint or promise-analysis
  suite; async handling was reviewed manually in the critical paths.
- `npm run lint:debt`: additionally reports unused locals/parameters; intentionally
  exits nonzero while historical debt remains. Do not use it as a CI gate yet.

Baseline: zero type/control-flow errors and 18 unused-code diagnostics.
After cleanup: zero type/control-flow errors and 15 unused-code diagnostics.
Auth token roles and restaurant response types no longer use `any`. Restaurant
response serialization is unchanged; the type describes fields common to both
owner and waiter responses. Unused auth/repository imports were removed.

Two manually identified correctness risks have focused regressions:

1. Socket.IO room joins can reject asynchronously. Join errors are now observed,
   logged once through the redacted logger with requestId where available, and
   the affected socket disconnects. Successful joins and trusted tenant selection
   remain unchanged. Both synchronous and asynchronous adapters are covered.
2. Error-code lookup previously accepted Object.prototype properties such as
   `constructor` as approved messages. Only own allowlist entries now qualify;
   inherited names return the existing generic redacted error.

Remaining unused-code diagnostics: auth controller (1), plan controller (1),
subscription controller (1), superadmin controller (6), WhatsApp routes (2), CRM
feedback (1), referral (2), RFM (1). These are historical maintainability items,
not 15 confirmed correctness bugs. In particular, unused `brandId`/`mScore` and
write-operation results need domain review; removing an apparently unused result
must never remove its database operation. No dynamic helpers or side effects were
removed. Broad `any` cleanup, typed ESLint promise rules, cosmetic conventions and
redundant catch/rethrow cleanup remain deferred for separately scoped work.

Payments, schema, environments, Redis/queue policies and API contracts are
unchanged. Existing payment and real-infrastructure TODOs remain deferred.
CI stays unchanged and discovers the new regression file automatically. Run
`npm run lint`, `npm run typecheck`, `npm run test:integration`, and
`node --require ./tests/support/isolation.cjs dist/scripts/test-preflight.js`.
No production credentials or data are needed. Do not commit generated `dist`.
