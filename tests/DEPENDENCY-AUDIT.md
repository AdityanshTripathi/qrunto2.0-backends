# P3 dependency review — revalidated 2026-09-12

Fresh registry audit (`npm audit --json --offline=false --prefer-online`):

The 2026-09-12 P3 audit reproduced the same remaining result: 3 high-severity
affected packages, all representing the single deferred `deepmerge-ts` advisory
through Prisma's pinned configuration dependency; 0 critical, moderate, or low.

| Scope | Before critical/high/moderate/low | After |
| --- | --- | --- |
| Full install | 0 / 7 / 5 / 1 | 0 / 3 / 0 / 0 |
| `--omit=dev` | 0 / 6 / 5 / 1 | 0 / 3 / 0 / 0 |

Counts are affected npm packages, including inherited findings, not distinct CVEs.
The sandbox/offline audit incorrectly returned zero; use a network-enabled audit.

## Targeted changes

| Package | Before → after | Finding | Dependency/exposure |
| --- | --- | --- | --- |
| socket.io-parser | 4.2.6 → 4.2.7 | High, memory exhaustion | Transitive production, Socket.IO |
| qs | 6.15.2 → 6.16.0 | Moderate, denial of service | Transitive production, Express/body-parser |
| body-parser | 2.2.2 → 2.3.0 | Low, size-limit enforcement | Transitive production, Express |
| brace-expansion | 5.0.6 → 5.0.9 | High, expansion denial of service | Transitive dev-only, minimatch |
| fast-uri | 3.1.2 → 3.1.7 | High, URI/host confusion | Transitive Prisma tooling via ajv |
| hono | 4.12.25 → 4.13.7 | Moderate, multiple advisories | Transitive Prisma tooling |
| @hono/node-server | 1.19.11 → 1.19.15 | Moderate, traversal/middleware bypass | Transitive Prisma tooling; scoped override |
| valibot | 1.2.0 → 1.4.2 | Moderate, validation error handling | Transitive Prisma tooling; scoped override |
| mysql2 | 3.15.3 → 3.24.3 | High auth downgrade; moderate decompression DoS | Transitive Prisma tooling; scoped override |

Prisma is declared as a direct devDependency, but Prisma Client's optional peer
keeps it and its tooling tree in npm's production audit (`devOptional` entries).
These findings must not be labelled absent from the production dependency tree.
The backend uses PostgreSQL and does not serve Hono/Prisma Studio endpoints.

Overrides are limited to the pinned children of `@prisma/dev` and `prisma`.
Other fixes use existing parent semver ranges. No application dependency major
was upgraded; the body-parser minor adds its own content-type 2.x alongside the
existing 1.x version. Necessary child changes also include iconv-lite 0.7.3 and
mysql2's switch from denque/seq-queue/sqlstring to sql-escaper 1.5.1.

## Deferred finding

`deepmerge-ts@7.1.5` remains high severity under
`prisma@7.8.0 → @prisma/config@7.8.0`; npm reports three affected packages for
this one advisory: [GHSA-ggr8-5vv4-36mx](https://github.com/advisories/GHSA-ggr8-5vv4-36mx).
The patched release is 8.0.0. Prisma pins 7.1.5, so replacing it crosses a major
version outside the supported range; npm alternatively recommends a Prisma 6
downgrade. Neither is forced in this compatibility-focused cleanup.

The advisory requires recursive object graphs, not ordinary JSON. Current
Prisma configuration is repository-controlled; request code does not directly
import deepmerge-ts. This reduces observed runtime exposure but does not remove
the finding or establish safety for every possible use of the toolchain.

Follow up with a Prisma release officially supporting the patched dependency,
or a separately reviewed deepmerge-ts 8 compatibility change. Until then review
and accept this scoped tooling exception; do not feed untrusted objects into
Prisma configuration or expose development tooling to untrusted callers.

## Verification

The 2026-09-12 P3 pass ran both registry audits, Prisma validation, TypeScript,
the production build, isolated preflight checks, and the full integration suite:
126 total tests, 124 passed, 0 failed, and 2 intentional TODOs. No hosted run,
dependency mutation, provider call, production access, or deployment was triggered.

Use Node 24.x with `npm ci`, Prisma validation/generation, `npm run test:integration`
(includes build/type-check), and the isolated preflight regression from Backend
CI. Payment/infrastructure TODOs remain deferred. No audit threshold was added
to CI, no `audit fix --force` used, and no business logic changed.
