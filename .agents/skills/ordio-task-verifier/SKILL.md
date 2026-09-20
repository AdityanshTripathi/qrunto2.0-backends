---
name: ordio-task-verifier
description: Verify completed Ordio backend implementations and fixes, determine whether the task is complete and safe for a local commit, and report any blockers or remaining risks.
---

# Ordio Task Verifier

Use this skill after implementing or fixing code in the Ordio backend repository. Verify only the task's intended scope and preserve all unrelated or pre-existing work.

## Establish the baseline

Before verification begins, record `git status` and identify:

- The source changes intended for the current task.
- Any pre-existing user changes, including tracked, untracked, and generated files.

Treat pre-existing changes as user-owned. Do not restore, clean, overwrite, stage, or otherwise modify them.

## Select proportional checks

After implementation, inspect the intended changes and automatically choose the smallest relevant verification set:

- Run Prisma validation and generation only when Prisma schema, generated client usage, or related configuration makes them relevant.
- Run the backend TypeScript typecheck for TypeScript changes.
- Run focused tests covering the changed functionality.
- Run a build when compilation needs verification or relevant tests import from `dist`.
- Run `git diff --check` and review the intended diff for correctness and scope.

Do not run expensive unrelated checks. Record every command actually run and its result.

If a check fails because of the task's changes, fix the issue and rerun the failed check. Do not claim that an unexecuted test or check passed. If the sandbox, missing dependencies, unavailable services, or permissions block a check, report the blocker precisely.

## Protect production and secrets

- Never run migrations, `db push`, database resets, seed scripts, or database-writing tests without explicit user authorization for that action.
- Never test against Supabase production.
- Require explicit user authorization before running real-database integration tests. Such tests must also retain and pass the repository's existing fail-closed local `ordio_dev` guard; authorization does not permit bypassing it.
- Never print or expose passwords, database URLs, access tokens, API keys, or other secrets in commands, logs, or reports.
- Never commit, push, deploy, or modify a production database unless the user explicitly authorizes that separate action.

## Handle `dist` safely

The repository tracks some generated `dist` files, and builds can both modify tracked files and create untracked files under `dist`.

- Never stage or commit `dist` automatically.
- Distinguish build-created changes from pre-existing user changes before considering cleanup.
- Never restore or clean pre-existing user changes.
- Clean build artifacts only when their origin and safe removal are established without ambiguity.
- If safe cleanup cannot be established, leave `dist` untouched and report exactly what remains.

## Review risks

Review the intended changes for applicable risks, including:

- Authentication and authorization behavior.
- Brand and tenant isolation.
- Legacy compatibility and existing clients or data shapes.
- Secret handling and accidental disclosure.
- Regression risk in adjacent backend behavior.

Keep this review relevant to the changed functionality rather than expanding into an unrelated audit.

## Final report

Return a concise report containing:

- Files changed for the task.
- Checks actually run and their results.
- Problems found and fixed during verification.
- Checks blocked or not run, with reasons.
- Remaining security or deployment risks.
- Final `git status`.
- A clear conclusion: ready or not ready for a **local commit**.

Never imply readiness to deploy merely because the task is ready for a local commit.
